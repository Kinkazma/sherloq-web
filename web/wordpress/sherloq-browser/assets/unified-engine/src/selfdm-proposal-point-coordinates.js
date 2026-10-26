import "../../runtime-context.js?v=0.25.0";
import {requireValue} from './errors.js';

/** Coordinate adaptation only. Gray preparation, NMS, ranking, sampling and
 * matching remain native. No point is removed, duplicated or reordered. */
export function mapSelfDMProposalPointCoordinates({pointsYX, bounds, size, proposalBounds, proposalSize}, {budget} = {}) {
  const rectangle = value => Array.isArray(value) && value.length === 4 && value.every(Number.isSafeInteger) && value[2] > value[0] && value[3] > value[1];
  const dimensions = value => Array.isArray(value) && value.length === 2 && value.every(v => Number.isSafeInteger(v) && v > 0);
  requireValue(pointsYX instanceof BigInt64Array && pointsYX.length % 2 === 0 && rectangle(bounds) && rectangle(proposalBounds) && dimensions(size) && dimensions(proposalSize) && typeof budget?.reserve === 'function',
    'Native owner points, actual owner/proposal geometry and allocation admission required');
  requireValue(bounds[0] >= proposalBounds[0] && bounds[1] >= proposalBounds[1] && bounds[2] <= proposalBounds[2] && bounds[3] <= proposalBounds[3], 'Owner lies outside its native proposal');
  const count = pointsYX.length / 2, free = budget.reserve(count * 2 * (4 + 8 + 4));
  try {
    // Double Original positions avoid rounding before conversion into the
    // common proposal chart. Native model points stay Float32 as before.
    const localXY = new Float32Array(count * 2), originalXY = new Float64Array(count * 2), proposalXY = new Float32Array(count * 2);
    const identity = bounds.every((v, i) => v === proposalBounds[i]) && size.every((v, i) => v === proposalSize[i]);
    for (let index = 0; index < count; index++) {
      const y = Number(pointsYX[index * 2]), x = Number(pointsYX[index * 2 + 1]);
      requireValue(Number.isSafeInteger(x) && Number.isSafeInteger(y) && x >= 0 && y >= 0 && x < size[0] && y < size[1], 'Native NMS point outside its owner');
      localXY[index * 2] = x; localXY[index * 2 + 1] = y;
      const ox = (bounds[2] - bounds[0]) / size[0] * x + bounds[0], oy = (bounds[3] - bounds[1]) / size[1] * y + bounds[1];
      originalXY[index * 2] = ox; originalXY[index * 2 + 1] = oy;
      // A whole owner bypasses the round-trip; this retains the exact native
      // Cast+flip coordinates, including all downstream normalization inputs.
      proposalXY[index * 2] = identity ? localXY[index * 2] : (ox - proposalBounds[0]) * proposalSize[0] / (proposalBounds[2] - proposalBounds[0]);
      proposalXY[index * 2 + 1] = identity ? localXY[index * 2 + 1] : (oy - proposalBounds[1]) * proposalSize[1] / (proposalBounds[3] - proposalBounds[1]);
    }
    let released = false;
    return {count, localXY, originalXY, proposalXY, metadata: {
      coordinatePolicy: 'native-owner-local-via-Original-to-proposal/1', ownerBounds: [...bounds], ownerSize: [...size], proposalBounds: [...proposalBounds], proposalSize: [...proposalSize],
      originalRounding: 'none before scientific matching; final sourceMatchedPoint truncation only at legacy output boundary',
      noHalfPixelOffsetAdded: true, noPointOrderOrCountChanged: true, wholeOwnerIdentity: identity,
    }, release() { if (!released) { free(); released = true; } }};
  } catch (error) { free(); throw error; }
}
