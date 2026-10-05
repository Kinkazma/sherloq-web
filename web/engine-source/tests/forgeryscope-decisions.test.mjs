import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {selectForgeryscopePanels, planForgeryscopeComparisons, classifyForgeryscopeMatch,
  laneOverlapGroups, bestLaneMatches, writeLaneUnion, laneDisplayBoxes} from '../src/forgeryscope-decisions.js';
const reference = JSON.parse(await readFile(new URL('./data/forgeryscope/decisions.json', import.meta.url)));

test('native lane decisions, ties, normalized similarity thresholds and final masks', async () => {
  assert.equal(reference.numpy, '1.26.4');
  for (const c of reference.cases) {
    const groups = laneOverlapGroups(c.lanes, c.overlapThreshold);
    assert.deepEqual(groups, c.groups);
    const matches = await bestLaneMatches(c.lanes, groups, (i, j) => c.scores[i][j], {threshold: c.threshold, skip: c.skip});
    assert.deepEqual(matches, c.matches);
    const width = c.width ?? 64, height = c.height ?? 24, mask = new Uint8Array(width * height);
    writeLaneUnion(mask, width, height, c.lanes, matches);
    assert.deepEqual([...mask], c.union);
  }
});

test('Auto lane gate uses blot candidates BEFORE intersection exclusion', () => {
  const panels = [['Blots', .9, 0, 0, 100, 100], ['Blots', .9, 10, 10, 110, 110]];
  const p = planForgeryscopeComparisons(panels, {overlap: [{panel0: 0, panel1: 1, score: .86}], duplicate: [{panel0: 0, panel1: 1, score: .9}]});
  assert.equal(p.blotPairs[0].score, .9); assert.deepEqual(p.comparisons, []); assert.equal(p.laneSearch, false);
  assert.equal(planForgeryscopeComparisons(panels).laneSearch, true);
  assert.equal(planForgeryscopeComparisons([]).laneSearch, false);
});

test('strict two-axis intersection margin, thresholds, stable sort and explicit variants', () => {
  const panels = [['Blots', 1, 0, 0, 20, 20], ['Blots', 1, 10, 0, 30, 20], ['Blots', 1, 50, 0, 70, 20]];
  const duplicate = [{panel0: 0, panel1: 1, score: .84}, {panel0: 0, panel1: 2, score: .83}];
  assert.equal(planForgeryscopeComparisons(panels, {profile: 'duplicate', duplicate}).comparisons.length, 1);
  assert.deepEqual(planForgeryscopeComparisons(panels, {profile: 'overlap', duplicate}).comparisons, []);
  assert.throws(() => planForgeryscopeComparisons(panels, {profile: 'unknown'}));
});

test('touching exclusions reject a panel before embeddings, boundary contact does not', () => {
  const panels = [['Graphs', 1, 0, 0, 50, 50], ['Blots', 1, 0, 0, 10, 10], ['Microscopy', 1, 10, 0, 20, 10]];
  const selected = selectForgeryscopePanels(panels, {exclusions: [[0, 0, 10, 10]]});
  assert.deepEqual(selected.panels, [panels[2]]); assert.deepEqual(selected.sourceIndices, [2]); assert.deepEqual(selected.excludedPanels, [panels[1]]);
  assert.equal(selectForgeryscopePanels(panels, {profile: 'duplicate'}).panels.length, 1);
});

test('Auto accepts blot similarity evidence, standalone keeps candidates separate', () => {
  const fallback = {fallback: 'full_bbox', inliers: 0, mean_match_score: 0};
  assert.deepEqual(classifyForgeryscopeMatch(fallback, 'Blots'), {supported: false, accepted: true, branch: 'blots', evidence: 'embedding', candidate: true});
  assert.equal(classifyForgeryscopeMatch(fallback, 'Blots', {profile: 'duplicate'}).accepted, false);
  assert.equal(classifyForgeryscopeMatch(fallback, 'Microscopy').candidate, false);
  assert.equal(classifyForgeryscopeMatch({inliers: 8, mean_match_score: .73}, 'Microscopy').supported, true);
  assert.equal(classifyForgeryscopeMatch({fallback: null, inliers: 80, mean_match_score: 1}, 'Blots').supported, false);
});

test('lane groups use area >25 and transitive closure, not two-axis margin', () => {
  const lane = bbox => ({panel_idx: 0, bbox});
  assert.deepEqual(laneOverlapGroups([lane([0, 0, 20, 20]), lane([18, 0, 38, 20]), lane([36, 0, 56, 20])]), [[0, 1, 2]]);
  assert.deepEqual(laneOverlapGroups([lane([0, 0, 5, 5]), lane([0, 0, 5, 5])]), [[0], [1]]);
});

test('whole-panel expansion counts occurrences and strict >50%, exclusions remain empty', () => {
  const lanes = Array.from({length: 4}, (_, i) => ({panel_idx: 0, bbox: [i*2, 0, i*2+1, 2], panel_bbox: ['Blots', 1, 0, 0, 10, 10]}));
  const match = {panel_idx1: 0, panel_idx2: 9, bbox1_absolute: [0, 0, 1, 2], bbox2_absolute: [12, 0, 13, 2], similarity: .8};
  assert.equal(laneDisplayBoxes(lanes, [match, match]).whole.has(0), false);
  assert.equal(laneDisplayBoxes(lanes, [match, match, match]).whole.has(0), true);
  const mask = new Uint8Array(200);
  writeLaneUnion(mask, 20, 10, lanes, [match, match, match], {exclusions: [[4, 4, 8, 8]]});
  assert.equal(mask[3*20+3], 1); assert.equal(mask[5*20+5], 0);
});

test('lane matching cancellation and invalid partition reject instead of yielding partial success', async () => {
  const c = reference.cases[0], controller = new AbortController(); controller.abort();
  await assert.rejects(bestLaneMatches(c.lanes, c.groups, (i,j) => c.scores[i][j], {signal: controller.signal}), {code: 'CANCELLED'});
  await assert.rejects(bestLaneMatches(c.lanes, [[0]], () => 1), {code: 'INVALID_INPUT'});
});
