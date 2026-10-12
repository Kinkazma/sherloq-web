import "../../runtime-context.js?v=0.16.0";
// Faithful local translation of pinned proposals_utils.py.
// Formulas and ordered first-match fusion are retained. Global allocation and publication belong to SelfDMProposalEngine.
const clone = box => [box[0].slice(), box[1], box[2]];
function intersection(a, b) {
  const x0 = Math.max(a[0], b[0]), y0 = Math.max(a[1], b[1]);
  const x1 = Math.min(a[2], b[2]), y1 = Math.min(a[3], b[3]);
  return x0 >= x1 || y0 >= y1 ? 0 : (x1 - x0) * (y1 - y0);
}
function meanRectangle(rect, score, width) {
  let sum = 0;
  for (let y = rect[1]; y < rect[3]; y++) for (let x = rect[0]; x < rect[2]; x++) sum += score[y * width + x];
  // The source map is float32 and numpy.mean returns float32 here. The exact
  // summation backend is separately measured by native end-to-end parity.
  return Math.fround(sum / ((rect[2] - rect[0]) * (rect[3] - rect[1])));
}
function merge(a, b, score, width) {
  const rect = [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[2], b[2]), Math.max(a[3], b[3])];
  return [rect, meanRectangle(rect, score, width), (rect[2] - rect[0]) * (rect[3] - rect[1])];
}

export function selectProposalBoxes(rectangles, score, width, height) {
  let final = [];
  for (const rect of rectangles) {
    if (!rect) continue;
    const size = (rect[2] - rect[0]) * (rect[3] - rect[1]);
    if (size > .4 * width * height) continue;
    const mean = meanRectangle(rect, score, width);
    if (mean < .4) continue;
    if (final.length === 0) { final.push([rect.slice(), mean, size]); continue; }
    let inserted = false;
    for (let i = 0; i < final.length; i++) {
      const inter = intersection(final[i][0], rect), iou = inter / (final[i][2] + size - inter);
      if (iou >= .5 && mean >= final[i][1]) {
        final[i] = [rect.slice(), mean, size]; inserted = true; break;
      }
      if (inter / final[i][2] >= .8 || inter / size >= .8) {
        const next = merge(rect, final[i][0], score, width);
        if (next[2] <= .4 * width * height && next[1] >= .3) { final[i] = next; inserted = true; break; }
      }
    }
    if (!inserted) final.push([rect.slice(), mean, size]);
  }
  let selected = [], merged = new Set();
  for (let i = 0; i < final.length; i++) {
    if (merged.has(i)) continue;
    let temp = clone(final[i]), mergeFlag = false;
    for (let j = i + 1; j < final.length; j++) {
      if (merged.has(j)) continue;
      const inter = intersection(temp[0], final[j][0]);
      if (inter / temp[2] > .5 || inter / final[j][2] > .5) {
        temp = merge(temp[0], final[j][0], score, width);
        if (temp[2] <= .4 * width * height && temp[1] >= .2) {
          merged.add(i); merged.add(j); selected.push(temp); mergeFlag = true;
        }
      }
    }
    if (!mergeFlag) { selected.push(final[i]); merged.add(i); }
  }
  const thresholds = [.5, .4, .3, .25];
  for (let iteration = 0; iteration < 50; iteration++) {
    if (iteration > 4 && final.length === selected.length) break;
    final = selected; selected = []; merged = new Set();
    const threshold = thresholds[iteration] ?? .2;
    for (let i = 0; i < final.length; i++) {
      if (merged.has(i)) continue;
      let temp = clone(final[i]), mergeFlag = false;
      for (let j = i + 1; j < final.length; j++) {
        if (merged.has(j)) continue;
        const inter = intersection(temp[0], final[j][0]);
        if (inter / temp[2] > threshold || inter / final[j][2] > threshold) {
          temp = merge(temp[0], final[j][0], score, width);
          if (temp[2] <= .4 * width * height && temp[1] >= .2) {
            merged.add(i); merged.add(j); selected.push(temp); mergeFlag = true;
          }
          if (!mergeFlag && (inter / final[i][2] > .5 || inter / final[j][2] > .5)) {
            selected.push(inter / final[i][2] <= inter / final[j][2] ? final[i] : final[j]);
            merged.add(i); merged.add(j); mergeFlag = true;
          }
        }
      }
      if (!mergeFlag) { selected.push(final[i]); merged.add(i); }
    }
  }
  return selected;
}

export function proposalResize(boxes) {
  let width = 320, height = 240;
  for (const [rect] of boxes) {
    width = Math.max(width, Math.min(2000, rect[2] - rect[0]));
    height = Math.max(height, Math.min(1500, rect[3] - rect[1]));
  }
  return [width, height];
}

export function createFirstMatchPaint(labels, count) {
  const offsets = new Int32Array(count + 1), indices = new Int32Array(labels.length);
  for (const label of labels) offsets[label + 1]++;
  for (let i = 1; i < offsets.length; i++) offsets[i] += offsets[i - 1];
  const positions = offsets.slice(0, count);
  for (let i = 0; i < labels.length; i++) indices[positions[labels[i]]++] = i;
  return {labels, offsets, indices, scores: new Float64Array(labels.length), painted: false};
}

export function paintMatchedPoints(target, points, matches, confidence, width) {
  const result = [];
  for (let index = 0; index < matches.length; index++) {
    if (Number(matches[index]) < 0) continue;
    const x = points[index * 2], y = points[index * 2 + 1];
    result.push([x, y]);
    const label = target.labels[Math.trunc(y) * width + Math.trunc(x)];
    if (label < 0) continue;
    for (let p = target.offsets[label]; p < target.offsets[label + 1]; p++) {
      const pixel = target.indices[p]; target.scores[pixel] = confidence[index]; target.labels[pixel] = -10;
    }
    target.painted = true;
  }
  return result;
}

export function sourceMatchedPoint(point, rect, resizedWidth, resizedHeight) {
  return [Math.trunc((rect[2] - rect[0]) / resizedWidth * point[0] + rect[0]), Math.trunc((rect[3] - rect[1]) / resizedHeight * point[1] + rect[1])];
}

export function fuseProposalScores(boxes, resizedMaps, score, width, height, matchedPoints) {
  if (boxes.length < 2 || matchedPoints.length < 8) return {score: new Float64Array(score), fellBackToInitial: true};
  const final = new Float64Array(width * height), background = new Uint8Array(width * height);
  for (let i = 0; i < boxes.length; i++) {
    if (!resizedMaps[i]) continue;
    const [x0, y0, x1, y1] = boxes[i][0], roiWidth = x1 - x0;
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) final[y * width + x] += resizedMaps[i][(y - y0) * roiWidth + x - x0];
  }
  // The pinned source intentionally applies this transform in box order,
  // including overlaps. It must not be replaced by an unordered union.
  for (const [rect] of boxes) {
    const [x0, y0, x1, y1] = rect;
    let any = false;
    for (let y = y0; y < y1 && !any; y++) for (let x = x0; x < x1; x++) if (final[y * width + x] > 0) { any = true; break; }
    if (!any) continue;
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
      const pixel = y * width + x; background[pixel] = 1; final[pixel] = final[pixel] * 4 + score[pixel] * 4 - 2;
    }
  }
  for (let i = 0; i < final.length; i++) final[i] = 1 / (1 + Math.exp(-final[i])) * background[i];
  return {score: final, fellBackToInitial: false};
}
