// These counters are local to the current analysis. A sub-step fraction is
// never presented as an end-to-end percentage or as physical CPU utilization.
export const AUTOMATIC_GROUPS = ['patchmatch', 'sift', 'forgeryscope', 'd2prl', 'ela'];
export function createAutomaticProgress(complete = true, now = () => Date.now()) {
  const startedAt = now(), groups = Object.fromEntries(AUTOMATIC_GROUPS.slice(0, complete ? 5 : 4).map(id => [id, {state: 'pending'}]));
  let lastUsefulAt = null, recoveries = 0, diagnostic = null;
  return {
    accept(event) {
      if (event.phase === 'automatic-state') {
        for (const [id, state] of Object.entries(event.state.states)) {
          if (groups[id]) Object.assign(groups[id], {state, attempt: event.state.attempts?.[id], error: event.state.errors?.[id]});
        }
      } else if (event.phase?.startsWith('diagnostic-')) diagnostic = event;
      else if (event.phase === 'resource-recovery') recoveries++;
      else if (!event.phase?.startsWith('resource-')) {
        lastUsefulAt = now();
        if (groups[event.group]) Object.assign(groups[event.group], {phase: event.phase, stage: event.stage, iteration: event.iteration, completed: event.completed, total: event.total, fraction: event.fraction, updatedAt: lastUsefulAt});
      }
      return this.snapshot();
    },
    snapshot() { return {startedAt, elapsedMs: now() - startedAt, lastUsefulAt, recoveries, groups: structuredClone(groups), diagnostic}; }
  };
}

export function automaticSelection(width, height, rectangles, mode = 'whole') {
  const envelope = [[0, 0], [width - 1, 0], [width - 1, height - 1], [0, height - 1]];
  if (mode === 'detected') return undefined;
  if (mode === 'whole') return {regions: [envelope], envelope, disabled: []};
  if (mode !== 'selected' || !rectangles.length) throw new Error('Select at least one image region.');
  const regions = rectangles.map(r => {
    if (!['x0', 'y0', 'x1', 'y1'].every(k => Number.isSafeInteger(r[k])) || r.x0 < 0 || r.y0 < 0 || r.x1 > width || r.y1 > height || r.x1 <= r.x0 || r.y1 <= r.y0) throw new Error('Region outside image.');
    return [[r.x0, r.y0], [r.x1 - 1, r.y0], [r.x1 - 1, r.y1 - 1], [r.x0, r.y1 - 1]];
  });
  const x0 = Math.min(...regions.map(p => p[0][0])), y0 = Math.min(...regions.map(p => p[0][1]));
  const x1 = Math.max(...regions.map(p => p[2][0])), y1 = Math.max(...regions.map(p => p[2][1]));
  const enclosing = [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
  if (!regions.some(p => JSON.stringify(p) === JSON.stringify(enclosing))) regions.push(enclosing);
  return {regions, envelope: enclosing, disabled: []};
}

export function automaticReport(result, progress, deployment) {
  return {schema: 'sherloq.automatic-report/1', engineCommit: deployment.engineCommit,
    operation: result?.operation, analysisId: result?.analysisId, status: result?.status ?? 'running',
    provenance: result?.provenance, selection: result?.selection, state: result?.data?.state,
    view: result?.data?.view, filters: result?.data?.filters, progress,
    entries: result?.data?.entries?.map(({pixel_mask, ...entry}) => ({...entry, ...(pixel_mask ? {mask: {width: pixel_mask.width, height: pixel_mask.height, storage: 'full scientific mask in NPZ export'}} : {})}))};
}
