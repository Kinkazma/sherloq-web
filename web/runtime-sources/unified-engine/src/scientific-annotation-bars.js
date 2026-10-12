import "../../runtime-context.js?v=0.17.0";
// Annotation geometry only. Biological image pixels are never rewritten or excluded.
export const SCIENTIFIC_ANNOTATION_BARS_POLICY = Object.freeze({
  schema: 'sherloq.scientific-annotations/1',
  version: 'outside-acquisition-bars-1',
  coordinates: 'original-pixels',
  outsideAcquisitionsOnly: true,
  changesAdmission: false,
  orientation: 'horizontal',
  coreDarkMaximum: 48,
  achromaticTolerance: 8,
  coreDeviationMaximum: 16,
  rowEdgeTolerance: 1,
  minimumLength: 20,
  minimumThickness: 2,
  maximumThickness: 10,
  minimumAspect: 6,
  antiAliasMaximum: 192,
  antiAliasPadding: 1,
  maximumReadRows: 32,
  maximumRetainedReadLeases: 2,
});

const rectanglePolygon = ({x0, y0, x1, y1}) => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
const bounds = polygon => ({
  x0: Math.min(...polygon.map(p => p[0])), y0: Math.min(...polygon.map(p => p[1])),
  x1: Math.max(...polygon.map(p => p[0])), y1: Math.max(...polygon.map(p => p[1])),
});
const overlaps = (a, b) => a.x0 <= b.x1 && b.x0 <= a.x1 && a.y0 <= b.y1 && b.y0 <= a.y1;
const cross = (a, b, p) => (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]);
const onSegment = (a, b, p) => Math.abs(cross(a, b, p)) <= 1e-9 &&
  p[0] >= Math.min(a[0], b[0]) && p[0] <= Math.max(a[0], b[0]) &&
  p[1] >= Math.min(a[1], b[1]) && p[1] <= Math.max(a[1], b[1]);
function segmentsTouch(a, b, c, d) {
  const abC = cross(a, b, c), abD = cross(a, b, d), cdA = cross(c, d, a), cdB = cross(c, d, b);
  return (abC * abD < 0 && cdA * cdB < 0) || onSegment(a, b, c) || onSegment(a, b, d) || onSegment(c, d, a) || onSegment(c, d, b);
}
function insideOrBoundary(point, polygon) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[j], b = polygon[i];
    if (onSegment(a, b, point)) return true;
    if ((a[1] > point[1]) !== (b[1] > point[1]) &&
      point[0] < (b[0] - a[0]) * (point[1] - a[1]) / (b[1] - a[1]) + a[0]) inside = !inside;
  }
  return inside;
}
function rectangleTouchesPolygon(rectangle, region) {
  if (!overlaps(rectangle, region.bounds)) return false;
  const corners = rectanglePolygon(rectangle), polygon = region.polygon;
  if (corners.some(p => insideOrBoundary(p, polygon)) || polygon.some(p =>
    p[0] >= rectangle.x0 && p[0] <= rectangle.x1 && p[1] >= rectangle.y0 && p[1] <= rectangle.y1)) return true;
  for (let i = 0; i < corners.length; i++) for (let j = 0; j < polygon.length; j++)
    if (segmentsTouch(corners[i], corners[(i + 1) % 4], polygon[j], polygon[(j + 1) % polygon.length])) return true;
  return false;
}
function acquisitionGeometry(regions, width, height) {
  if (!Array.isArray(regions)) throw new TypeError('Original acquisition regions are required for annotation qualification');
  return regions.map(region => {
    if (region?.envelope || region?.role === 'cross-panel-search')
      throw new TypeError('Annotation qualification requires acquisition regions, not search envelopes');
    const polygon = region?.polygon ?? rectanglePolygon(region ?? {});
    if (polygon.length < 3 || polygon.some(p => !Array.isArray(p) || p.length !== 2 || !p.every(Number.isFinite) ||
      p[0] < 0 || p[0] > width || p[1] < 0 || p[1] > height))
      throw new TypeError('Acquisition geometry must use original image coordinates');
    const box = bounds(polygon);
    if (!(box.x0 < box.x1 && box.y0 < box.y1)) throw new TypeError('Empty acquisition geometry');
    return {polygon, bounds: box};
  });
}

/**
 * Recognize isolated, flat dark rectangles that already lie outside all acquisitions.
 * This is not an image-type classifier or a biological-band detector. It only supplies
 * explanatory polygons for the already excluded complement, without changing scope.
 * Uses original interleaved RGB/RGBA and at most one row of active run components.
 * A one-pixel raster edge drift is permitted; every row has the same flat inner core.
 * readRows returns caller-budgeted native {pixels:{width,height,data},release()} leases.
 * The current and previous 32-row blocks suffice for the 10-row core plus its halo;
 * no full-image buffer or additional budget reservation is created here.
 */
export async function detectScientificAnnotationBars({
  width, height, data, readRows, channels = 4, regions, sourceSha256, signal,
  yieldTask = () => new Promise(resolve => setTimeout(resolve, 0)),
} = {}) {
  const hasData = data !== undefined, hasRows = typeof readRows === 'function';
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width <= 0 || height <= 0 ||
    !Number.isSafeInteger(width * height * channels) || ![3, 4].includes(channels) || hasData === hasRows ||
    hasData && (!(data instanceof Uint8Array || data instanceof Uint8ClampedArray) || data.length !== width * height * channels) ||
    !/^[a-f0-9]{64}$/.test(sourceSha256 ?? ''))
    throw new TypeError('Annotation detection requires original RGB/RGBA pixels, dimensions and source SHA-256');
  signal?.throwIfAborted();
  const policy = SCIENTIFIC_ANNOTATION_BARS_POLICY, acquisitions = acquisitionGeometry(regions, width, height);
  const result = {
    schema: policy.schema, version: policy.version, coordinates: policy.coordinates,
    sourceSha256, width, height, status: acquisitions.length ? 'complete' : 'needs-review',
    polygons: [], detections: [], policy,
    provenance: {source: 'original-bitmap-rgb', method: 'common-flat-row-core; one-pixel-raster-edge-tolerance', model: null},
    coverage: {orientation: 'horizontal', exhaustive: false, biologicalBandsExcluded: false},
    memory: {source: hasRows ? 'leased-row-windows' : 'supplied-original-buffer',
      fullImageAllocation: false, temporaryAllocatedBytes: 0, peakWindowBytes: 0,
      maximumReadRows: policy.maximumReadRows, maximumRetainedReadLeases: policy.maximumRetainedReadLeases,
      accounting: 'readRows leases already charged by caller; no duplicate reservation'},
  };
  if (!acquisitions.length) return result;
  const blocks = [];
  const loadRows = async y => {
    if (!hasRows || blocks.some(block => y >= block.y && y < block.y + block.rows)) return;
    if (blocks.length === policy.maximumRetainedReadLeases) await blocks.shift().lease.release();
    signal?.throwIfAborted();
    const rows = Math.min(policy.maximumReadRows, height - y), lease = await readRows(y, rows, {signal});
    try {
      const pixels = lease?.pixels;
      if (typeof lease?.release !== 'function' || pixels?.width !== width || pixels?.height !== rows ||
        !(pixels.data instanceof Uint8Array || pixels.data instanceof Uint8ClampedArray) || pixels.data.length !== width * rows * channels)
        throw new TypeError('Annotation readRows must return a bounded native pixel lease with release()');
      blocks.push({y, rows, lease, data: pixels.data});
    } catch (error) { if (typeof lease?.release === 'function') await lease.release(); throw error; }
    result.memory.peakWindowBytes = Math.max(result.memory.peakWindowBytes, blocks.reduce((n, block) => n + block.data.byteLength, 0));
    signal?.throwIfAborted();
  };
  const gray = (x, y) => {
    if (x < 0 || x >= width || y < 0 || y >= height) return 255;
    const block = hasRows ? blocks.find(block => y >= block.y && y < block.y + block.rows) : null;
    if (hasRows && !block) throw new Error('Annotation row cache cannot cover the bounded core/halo');
    const pixels = block?.data ?? data, at = ((block ? y - block.y : y) * width + x) * channels;
    const r = pixels[at], g = pixels[at + 1], b = pixels[at + 2];
    if (channels === 4 && pixels[at + 3] !== 255 || Math.max(r, g, b) - Math.min(r, g, b) > policy.achromaticTolerance) return 255;
    return Math.max(r, g, b);
  };
  const finish = core => {
    const length = core.innerRight - core.innerLeft, thickness = core.y1 - core.y0;
    if (thickness < policy.minimumThickness || thickness > policy.maximumThickness ||
      length / thickness < policy.minimumAspect) return;
    let sum = 0, squared = 0;
    for (let y = core.y0; y < core.y1; y++) for (let x = core.innerLeft; x < core.innerRight; x++) {
      const value = gray(x, y);
      if (value > policy.coreDarkMaximum) return;
      sum += value; squared += value * value;
    }
    const count = length * thickness, mean = sum / count, deviation = Math.sqrt(Math.max(0, squared / count - mean * mean));
    if (deviation > policy.coreDeviationMaximum || acquisitions.some(r => rectangleTouchesPolygon(core, r))) return;
    // A dark extension or corner is a connected component, not an isolated flat bar.
    // Only light anti-aliasing one pixel away may expand the annotation rectangle.
    let left = false, right = false, top = false, bottom = false;
    for (let y = core.y0 - 1; y <= core.y1; y++) for (let x = core.x0 - 1; x <= core.x1; x++) {
      if (x >= core.x0 && x < core.x1 && y >= core.y0 && y < core.y1) continue;
      const value = gray(x, y);
      if (value <= policy.coreDarkMaximum) return;
      if (value > policy.antiAliasMaximum) continue;
      if (x < core.x0) left = true;
      if (x >= core.x1) right = true;
      if (y < core.y0) top = true;
      if (y >= core.y1) bottom = true;
    }
    const rectangle = {
      x0: Math.max(0, core.x0 - Number(left)), y0: Math.max(0, core.y0 - Number(top)),
      x1: Math.min(width, core.x1 + Number(right)), y1: Math.min(height, core.y1 + Number(bottom)),
    };
    // Checking the entire expanded rectangle also protects anti-aliased corners.
    if (acquisitions.some(r => rectangleTouchesPolygon(rectangle, r))) return;
    const polygon = rectanglePolygon(rectangle);
    result.polygons.push(polygon);
    result.detections.push({type: 'drawn-horizontal-bar', role: 'outside-acquisition-annotation',
      polygon, rectangle: [rectangle.x0, rectangle.y0, rectangle.x1, rectangle.y1],
      coreRectangle: [core.innerLeft, core.y0, core.innerRight, core.y1], coreMean: mean, coreDeviation: deviation,
      geometryQualified: true, alreadyExcluded: true, modelConfidence: null});
  };
  let active = new Map(), failure;
  try {
  for (let y = 0; y < height; y++) {
    signal?.throwIfAborted();
    await loadRows(y);
    const next = new Map();
    for (let x = 0; x < width;) {
      if (gray(x, y) > policy.coreDarkMaximum) { x++; continue; }
      const x0 = x;
      while (x < width) {
        const value = gray(x, y); if (value > policy.coreDarkMaximum) break;
        x++;
      }
      if (x - x0 < policy.minimumLength) continue;
      // Endpoints may differ by one antialiased raster pixel over the whole component,
      // not one pixel per row (which would accept a staircase or a diagonal stroke).
      const previous = [...active.values()].find(core =>
        Math.max(core.innerLeft, x0) - Math.min(core.x0, x0) <= policy.rowEdgeTolerance &&
        Math.max(core.x1, x) - Math.min(core.innerRight, x) <= policy.rowEdgeTolerance);
      if (previous) {
        active.delete(previous);
        previous.y1 = y + 1;
        previous.x0 = Math.min(previous.x0, x0); previous.x1 = Math.max(previous.x1, x);
        previous.innerLeft = Math.max(previous.innerLeft, x0); previous.innerRight = Math.min(previous.innerRight, x);
        next.set(previous, previous);
      } else {
        const core = {x0, y0: y, x1: x, y1: y + 1, innerLeft: x0, innerRight: x};
        next.set(core, core);
      }
    }
    for (const core of active.values()) finish(core);
    active = next;
    if (y % 64 === 63) { await yieldTask(); signal?.throwIfAborted(); }
  }
  for (const core of active.values()) finish(core);
  return result;
  } catch (error) { failure = error; throw error; }
  finally {
    const released = await Promise.allSettled(blocks.splice(0).map(block => Promise.resolve().then(() => block.lease.release())));
    const errors = released.filter(item => item.status === 'rejected').map(item => item.reason);
    if (errors.length && !failure) throw new AggregateError(errors, 'Annotation pixel leases could not be released');
  }
}
