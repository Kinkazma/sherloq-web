import "../../runtime-context.js?v=0.14.5";
/** Public Forgeryscope decision stages. These functions do not run neural networks.
 * Reference: native forgeryscope_auto/adapter and public matcher/{geometry,lane}.
 * Coordinates are original-image pixels; panel order remains the detector order.
 */
import {checkAbort, checkpoint, requireValue} from './errors.js';

export const FORGERYSCOPE_PROFILES = Object.freeze({
  auto: 'Forgeryscope Auto', microscopy: 'Forgeryscope microscopie',
  duplicate: 'Forgeryscope blots complets', overlap: 'Forgeryscope chevauchements',
  lanes: 'Forgeryscope pistes'
});
export const FORGERYSCOPE_THRESHOLDS = Object.freeze({
  microscopy: .58, duplicate: .84, overlap: .85, lanes: .65,
  inliers: 8, matchScore: .73, intersectionMargin: 10, laneOverlap: 5
});
const pairKey = (a, b) => a < b ? `${a}:${b}` : `${b}:${a}`;
const bounds = panel => panel.slice(-4);
const intersection = (a, b) => [Math.max(0, Math.min(a[2], b[2]) - Math.max(a[0], b[0])), Math.max(0, Math.min(a[3], b[3]) - Math.max(a[1], b[1]))];
const validBox = b => Array.isArray(b) && b.length === 4 && b.every(Number.isFinite) && b[0] <= b[2] && b[1] <= b[3];

export function selectForgeryscopePanels(detected, {profile = 'auto', exclusions = []} = {}) {
  requireValue(Object.hasOwn(FORGERYSCOPE_PROFILES, profile), 'Unknown Forgeryscope profile.');
  requireValue(Array.isArray(detected) && exclusions.every(validBox), 'Invalid Forgeryscope panels/exclusions.');
  const panels = [], excludedPanels = [], sourceIndices = [];
  detected.forEach((panel, index) => {
    requireValue(Array.isArray(panel) && panel.length === 6 && typeof panel[0] === 'string' && Number.isFinite(panel[1]) && validBox(bounds(panel)), 'Invalid detector panel.');
    const label = panel[0];
    if (profile === 'auto' ? !['Microscopy', 'Blots'].includes(label) : label !== (profile === 'microscopy' ? 'Microscopy' : 'Blots')) return;
    if (exclusions.some(box => intersection(bounds(panel), box).every(x => x > 0))) excludedPanels.push([...panel]);
    else {panels.push([...panel]); sourceIndices.push(index);}
  });
  return {panels, excludedPanels, sourceIndices};
}

/** pairs have global panel IDs after selection; embeddings must come from the named model. */
export function planForgeryscopeComparisons(panels, {profile = 'auto', microscopy = [], duplicate = [], overlap = []} = {}) {
  requireValue(Object.hasOwn(FORGERYSCOPE_PROFILES, profile), 'Unknown Forgeryscope profile.');
  const accept = (rows, label, threshold) => rows.filter(row => {
    const {panel0: i, panel1: j, score} = row;
    requireValue(Number.isInteger(i) && Number.isInteger(j) && i >= 0 && i < j && j < panels.length && Number.isFinite(score), 'Invalid embedding pair.');
    requireValue(panels[i][0] === label && panels[j][0] === label, 'Embedding pair label differs from its panels.');
    return score >= threshold;
  }).map(row => ({label, score: row.score, panel0: row.panel0, panel1: row.panel1})).sort((a, b) => b.score - a.score);
  const micro = profile === 'auto' || profile === 'microscopy' ? accept(microscopy, 'Microscopy', .58) : [];
  const blotOverlap = profile === 'auto' || profile === 'overlap' ? accept(overlap, 'Blots', .85) : [];
  const blotDuplicate = profile === 'auto' || profile === 'duplicate' ? accept(duplicate, 'Blots', .84) : [];
  const best = new Map();
  for (const row of [...blotOverlap, ...blotDuplicate]) {
    const key = pairKey(row.panel0, row.panel1), old = best.get(key);
    if (!old || row.score > old.score) best.set(key, row);
  }
  const blotPairs = [...best.values()];
  const comparisons = [...blotPairs, ...micro].filter(row => !intersection(bounds(panels[row.panel0]), bounds(panels[row.panel1])).every(x => x > 10));
  // Native Auto deliberately checks BEFORE removing intersecting pairs.
  const laneSearch = profile === 'lanes' || (profile === 'auto' && panels.some(p => p[0] === 'Blots') && blotPairs.length === 0);
  return {comparisons, blotPairs, laneSearch};
}

export function classifyForgeryscopeMatch(match, label, {profile = 'auto'} = {}) {
  requireValue(Object.hasOwn(FORGERYSCOPE_PROFILES, profile) && ['Microscopy', 'Blots'].includes(label), 'Invalid match profile/label.');
  requireValue(match && Number.isFinite(match.inliers) && Number.isFinite(match.mean_match_score), 'Invalid geometric result.');
  const supported = !Object.hasOwn(match, 'fallback') && match.inliers >= 8 && match.mean_match_score >= .73;
  const accepted = profile === 'auto' ? label === 'Blots' || supported : supported;
  return {supported, accepted, branch: label === 'Microscopy' ? 'microscopy' : 'blots', evidence: supported ? 'geometry' : 'embedding', candidate: !supported && (profile !== 'auto' || accepted)};
}

export function laneOverlapGroups(lanes, threshold = 5) {
  requireValue(Number.isFinite(threshold) && threshold >= 0, 'Invalid lane overlap threshold.');
  const parent = lanes.map((lane, i) => {requireValue(Number.isInteger(lane.panel_idx) && validBox(lane.bbox), 'Invalid lane.'); return i;});
  const root = i => {while (parent[i] !== i) {parent[i] = parent[parent[i]]; i = parent[i];} return i;};
  for (let i = 0; i < lanes.length; i++) for (let j = i + 1; j < lanes.length; j++) {
    if (lanes[i].panel_idx !== lanes[j].panel_idx) continue;
    const [x, y] = intersection(lanes[i].bbox, lanes[j].bbox);
    if (x * y > threshold * threshold) parent[root(j)] = root(i);
  }
  const groups = new Map();
  lanes.forEach((_, i) => {const r = root(i); if (!groups.has(r)) groups.set(r, []); groups.get(r).push(i);});
  return [...groups.values()];
}

function absoluteLaneBox(lane) {
  const box = lane.bbox, panel = lane.panel_bbox;
  if (!panel) return [...box];
  const [x, y] = bounds(panel);
  return [x + box[0], y + box[1], x + box[2], y + box[3]];
}

/** score(i,j) is the normalized-embedding dot product supplied by the backend.
 * Stream rows instead of materializing a quadratic similarity matrix.
 */
export async function bestLaneMatches(lanes, groups, score, {threshold = .65, skip = [], precision = 'float64', signal} = {}) {
  requireValue(typeof score === 'function' && ['float32', 'float64'].includes(precision) && Number.isFinite(threshold), 'Invalid lane similarity provider.');
  const membership = new Int32Array(lanes.length).fill(-1);
  groups.forEach((group, g) => group.forEach(i => {requireValue(Number.isInteger(i) && i >= 0 && i < lanes.length && membership[i] === -1, 'Invalid lane overlap partition.'); membership[i] = g;}));
  requireValue(membership.every(i => i >= 0), 'Missing lane overlap group.');
  const skipped = new Set(skip.map(([a, b]) => pairKey(a, b))), best = new Map();
  // Native NumPy 1.26 promotes a float32 scalar against the Python float threshold.
  // float32 is explicit for backends targeting NumPy 2 scalar promotion instead.
  const cutoff = precision === 'float32' ? Math.fround(threshold) : threshold;
  for (let i = 0; i < lanes.length; i++) {
    await checkpoint(signal);
    await score.prepareRow?.(i);
    for (let j = i + 1; j < lanes.length; j++) {
      if (membership[i] === membership[j] || skipped.has(pairKey(lanes[i].panel_idx, lanes[j].panel_idx))) continue;
      const s = score(i, j); requireValue(Number.isFinite(s), 'Nonfinite lane similarity.');
      if (s < cutoff) continue;
      const key = pairKey(membership[i], membership[j]), old = best.get(key);
      if (!old || s > old.similarity) best.set(key, {idx1: i, idx2: j, similarity: s,
        bbox1_relative: [...lanes[i].bbox], bbox2_relative: [...lanes[j].bbox],
        bbox1_absolute: absoluteLaneBox(lanes[i]), bbox2_absolute: absoluteLaneBox(lanes[j]),
        panel_idx1: lanes[i].panel_idx, panel_idx2: lanes[j].panel_idx});
    }
  }
  checkAbort(signal); return [...best.values()];
}

/** Preserve NumPy slice semantics, including truncation and negative indices. */
function fillSlice(mask, width, height, box, value = 1) {
  const clamp = (x, n) => {x = Math.trunc(x); return Math.min(n, Math.max(0, x < 0 ? n + x : x));};
  const [x0, y0, x1, y1] = [clamp(box[0], width), clamp(box[1], height), clamp(box[2], width), clamp(box[3], height)];
  if (x1 <= x0) return;
  for (let y = y0; y < y1; y++) mask.fill(value, y * width + x0, y * width + x1);
}

/** The native routine counts match occurrences, not unique matched lanes. */
export function laneDisplayBoxes(lanes, matches, fraction = .5) {
  const totals = new Map(), counts = new Map(), boxes = new Map();
  for (const lane of lanes) {const p = lane.panel_idx; totals.set(p, (totals.get(p) ?? 0) + 1); if (!boxes.has(p)) boxes.set(p, lane.panel_bbox ? bounds(lane.panel_bbox) : null);}
  for (const match of matches) for (const p of [match.panel_idx1, match.panel_idx2]) counts.set(p, (counts.get(p) ?? 0) + 1);
  const whole = new Set([...totals].filter(([p, n]) => (counts.get(p) ?? 0) > fraction * n).map(([p]) => p));
  return {whole, pairs: matches.map(m => ({panel0: m.panel_idx1, panel1: m.panel_idx2, score: m.similarity,
    box0: whole.has(m.panel_idx1) ? boxes.get(m.panel_idx1) : m.bbox1_absolute,
    box1: whole.has(m.panel_idx2) ? boxes.get(m.panel_idx2) : m.bbox2_absolute}))};
}

/** Writes to an admitted caller-owned mask; no full-image allocation per pair. */
export function writeLaneUnion(mask, width, height, lanes, matches, {exclusions = []} = {}) {
  requireValue(Number.isSafeInteger(width) && width > 0 && Number.isSafeInteger(height) && height > 0 && mask instanceof Uint8Array && mask.length === width * height, 'Invalid lane output mask.');
  const display = laneDisplayBoxes(lanes, matches);
  for (const pair of display.pairs) for (const box of [pair.box0, pair.box1]) if (box) fillSlice(mask, width, height, box);
  for (const box of exclusions) {requireValue(validBox(box), 'Invalid exclusion.'); fillSlice(mask, width, height, box, 0);}
  return display;
}
