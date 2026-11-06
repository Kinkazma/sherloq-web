import {requireValue} from './errors.js';

export const DENSE_PROFILES = Object.freeze([
  'PatchMatch Zernike',
  'PatchMatch SIFT',
  'PatchMatch Zernike + PatchMatch SIFT',
  'Extended: PatchMatch Zernike + PatchMatch SIFT',
  'PatchMatch Zernike + PatchMatch SIFT + Mirror',
  'Extended: PatchMatch Zernike + PatchMatch SIFT + Mirror',
]);
const roundedEven = value => {
  const lo = Math.floor(value), fraction = value - lo;
  return fraction === .5 ? lo + (lo % 2 !== 0 ? 1 : 0) : Math.round(value);
};

// Native descriptor-bin hypotheses: Python round uses ties to even. Equal
// parity aligns centers exactly; neither pixels nor vectors are resampled.
export function denseScaleBins(patch, width, height) {
  requireValue(Number.isInteger(patch) && patch >= 3 && patch <= 32, 'SIFT patch must be 3..32.');
  requireValue(Number.isSafeInteger(width) && Number.isSafeInteger(height) && width > 0 && height > 0, 'Invalid image dimensions.');
  const low = 3 + ((patch - 3) % 2), high = 32 - ((32 - patch) % 2);
  return [...new Set([.75, 1, 1.25, 1.5].map(f =>
    Math.max(low, Math.min(high, patch + 2 * roundedEven((patch * f - patch) / 2)))))]
    .sort((a, b) => a - b).filter(size => Math.min(width, height) > 3 * Math.max(patch, size));
}

export function densePassPlan(profile, {patch = 8, width, height, flip = false} = {}) {
  requireValue(DENSE_PROFILES.includes(profile), 'Unknown dense profile.');
  requireValue(typeof flip === 'boolean', 'Invalid reflection setting.');
  const sift = profile !== DENSE_PROFILES[0];
  requireValue(Number.isInteger(patch) && patch >= (sift ? 3 : 2) && patch <= 32, 'Invalid descriptor patch.');
  requireValue(Number.isSafeInteger(width) && Number.isSafeInteger(height) && Math.min(width, height) > 3 * patch, 'Dense descriptors need dimensions above three patch sizes.');
  const extended = profile.startsWith('Extended:'), mirror = profile.endsWith(' + Mirror');
  const bins = extended ? denseScaleBins(patch, width, height) : [];
  const passes = [];
  const add = (method, targetPatch = patch, quarterTurn = false, reflection = flip, stage = 'base') => passes.push(Object.freeze({
    id: passes.length, algorithm: DENSE_PROFILES[method], method, patch, targetPatch,
    quarterTurn, reflection, stage, descriptorFrame: quarterTurn ? `quarter_turn/bin=${targetPatch}` : 'normal',
    // These are required postprocessing policies, not claims that geometry ran.
    requireTransform: stage === 'extended' || (stage === 'mirror' && targetPatch !== patch),
    requireReflection: stage === 'mirror', requireDetail: stage !== 'base',
  }));
  if (profile === DENSE_PROFILES[0]) add(0);
  else if (profile === DENSE_PROFILES[1]) add(1);
  else {
    add(0, patch, false, mirror ? false : flip);
    add(1, patch, false, mirror ? false : flip);
    for (const bin of bins) add(1, bin, true, mirror ? false : flip, 'extended');
    if (mirror) {
      add(0, patch, false, true, 'mirror');
      add(1, patch, true, true, 'mirror');
      for (const bin of bins) if (bin !== patch) add(1, bin, true, true, 'mirror');
    }
  }
  return Object.freeze({profile, bins: Object.freeze(bins), passes: Object.freeze(passes)});
}

// Context identity is separate from polygon equality. Two overlapping or even
// equal independently requested searches must remain distinct for corroboration.
export function denseSearchContexts(regions = [], compare = false) {
  requireValue(Array.isArray(regions) && typeof compare === 'boolean', 'Invalid dense search regions.');
  requireValue(!compare || regions.length === 2, 'Compare requires exactly two zones.');
  for (const polygon of regions) requireValue(Array.isArray(polygon) && polygon.length >= 3 && polygon.every(p => Array.isArray(p) && p.length === 2 && p.every(Number.isFinite)), 'Invalid search polygon.');
  const copy = polygon => Object.freeze(polygon.map(point => Object.freeze([...point])));
  const jobs = compare ? [regions] : regions.length ? regions.map(r => [r]) : [[]];
  return Object.freeze(jobs.map((polygons, index) => Object.freeze({
    id: compare ? 'compare:0' : regions.length ? `roi:${index}` : 'global:0',
    pairSearchRegion: compare ? -1 : index, compare,
    regions: Object.freeze(polygons.map(copy)),
  })));
}
