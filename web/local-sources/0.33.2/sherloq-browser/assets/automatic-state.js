// These counters are local to the current analysis. A sub-step fraction is
// never presented as an end-to-end percentage or as physical CPU utilization.
export const AUTOMATIC_GROUPS = ['patchmatch', 'sift', 'forgeryscope', 'd2prl', 'ela'];
export function createAutomaticProgress(complete = true, now = () => Date.now()) {
  const startedAt = now(), groups = Object.fromEntries(AUTOMATIC_GROUPS.slice(0, complete ? 5 : 4).map(id => [id, {state: 'pending'}]));
  let lastUsefulAt = null, recoveries = 0, diagnostic = null, settledAt = null, state = 'running', runId = null;
  return {
    accept(event) {
      if (event.phase === 'automatic-state') {
        for (const [id, state] of Object.entries(event.state.states)) {
          if (groups[id]) {
            Object.assign(groups[id], {state, attempt: event.state.attempts?.[id], error: event.state.errors?.[id]});
            const availability = event.state.nativeContextAvailability?.[id];
            if (availability) groups[id].nativeContextAvailability = structuredClone(availability);
            else delete groups[id].nativeContextAvailability;
          }
        }
      } else if (event.phase?.startsWith('diagnostic-')) diagnostic = event;
      else if (event.phase === 'resource-recovery') recoveries++;
      else if (!event.phase?.startsWith('resource-')) {
        lastUsefulAt = now();
        if (groups[event.group]) Object.assign(groups[event.group], {phase: event.phase, stage: event.stage, iteration: event.iteration, completed: event.completed, total: event.total, fraction: event.fraction, updatedAt: lastUsefulAt});
      }
      return this.snapshot();
    },
    bindRunId(id) {
      if (typeof id !== 'string' || !id || id.length > 160 || runId !== null && runId !== id || runId === null && settledAt !== null) throw TypeError('Automatic progress belongs to a different submitted run.');
      runId = id; return this.snapshot();
    },
    // A stopped interval alone does not stop later export snapshots. Freeze
    // elapsed wall time at the actual terminal event; only explicit resume
    // reopens this same progress owner. Group outcomes remain independent.
    settle(outcome) {
      if (!['completed', 'partial', 'failed', 'suspended', 'cancelled'].includes(outcome)) throw TypeError('Invalid automatic execution outcome.');
      if (settledAt === null) { settledAt = now(); state = outcome; }
      return this.snapshot();
    },
    resume() { if (settledAt !== null) { settledAt = null; state = 'running'; } return this.snapshot(); },
    snapshot() { return {startedAt, settledAt, state, runId, elapsedMs: Math.max(0, (settledAt ?? now()) - startedAt), lastUsefulAt, recoveries, groups: structuredClone(groups), diagnostic}; }
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
    operation: result?.operation, analysisId: result?.analysisId, status: progress?.state === 'failed' ? 'error' : ['suspended', 'cancelled'].includes(progress?.state) ? progress.state : result?.status ?? (progress?.state === 'partial' ? 'partial' : 'running'),
    executionState: progress?.state ?? 'running', ...(result?.status ? {resultStatus: result.status} : {}),
    provenance: result?.provenance, selection: result?.selection, state: result?.data?.state,
    view: result?.data?.view, filters: result?.data?.filters, progress,
    entries: result?.data?.entries?.map(({pixel_mask, ...entry}) => ({...entry, ...(pixel_mask ? {mask: {width: pixel_mask.width, height: pixel_mask.height, storage: 'full scientific mask in NPZ export'}} : {})}))};
}


export function automaticAnalysisIncomplete(result) {
  return result?.status !== 'ok' || Object.values(result?.data?.state?.states ?? {}).some(state => !['done', 'skipped', 'feature-uninstalled'].includes(state)) || Object.values(result?.data?.state?.nativeContextAvailability ?? {}).some(a => ['partial', 'not-evaluable'].includes(a?.status));
}

/** Settled execution and native scientific availability are separate. This
 * notice belongs only to its group and never says that all groups had no data. */
export function automaticNativeGroupNotice(group, language = 'fr') {
  const a = group?.nativeContextAvailability;
  if (group?.state !== 'done' || a?.schema !== 'sherloq.native-context-availability/1' ||
      a.code !== 'NATIVE_CONTEXT_NOT_EVALUABLE' || !['partial', 'not-evaluable'].includes(a.status) ||
      ![a.notEvaluableContexts, a.classification, a.lanes].every(n => Number.isSafeInteger(n) && n >= 0) ||
      a.notEvaluableContexts < 1 || a.classification + a.lanes !== a.notEvaluableContexts) return null;
  const en = language === 'en', parts = [];
  if (a.classification) parts.push(en ? a.classification + (a.classification === 1 ? ' region could not be classified' : ' regions could not be classified') : a.classification + (a.classification === 1 ? ' zone non classifiable' : ' zones non classifiables'));
  if (a.lanes) parts.push(en ? 'Lane search unavailable for ' + a.lanes + (a.lanes === 1 ? ' region' : ' regions') : 'Recherche de pistes impossible pour ' + a.lanes + (a.lanes === 1 ? ' zone' : ' zones'));
  const all = a.status === 'not-evaluable';
  return {status: a.status, label: en ? (all ? 'Not evaluable' : 'Partially analysed') : (all ? 'Non évaluable' : 'Partiellement analysé'),
    text: parts.join('; ') + '. ' + (en ? (all ? 'No score was calculated for this group.' : 'The other calculations in this group were preserved.') : (all ? 'Aucun score n’a été calculé pour ce groupe.' : 'Les autres calculs de ce groupe sont conservés.'))};
}
