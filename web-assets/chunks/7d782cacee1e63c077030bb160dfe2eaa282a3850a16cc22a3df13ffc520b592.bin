// A small graph projection inside the common native engine. The component
// partition and targets remain those of the native kernel; no pixel graph,
// source resampling, or second image engine is constructed here.
import {createProjectionOSQP} from '../engine/src/sherloq7c-project.js';
import {createResidentArray} from '../engine/src/sherloq7c-resident-memory.js';
import {cooperator} from '../engine/src/sherloq7c-math.js';
const MiB = 1024 ** 2;
const fail = (code, message, details) => Object.assign(new Error(message), {code, details});
export const componentProjectionReservationBytes = components => 34 * MiB + 256 * components * components + 192 * components;

export async function projectNativeComponents({width, height, components, graph, targetAt, zeroAt,
  budget, workspaceLease, certificateTolerance, signal, onProgress}) {
  if (!Number.isInteger(components) || components < 1 || components > 64 || !budget?.reserve) {
    throw fail('INVALID_INPUT', 'A funded native component graph with at most 64 components is required.');
  }
  const C = components, N = width * height, pause = cooperator(signal);
  const maximum = 32 * MiB, overhead = 2 * MiB + 256 * C * C + 192 * C;
  let lease = workspaceLease, solver, backing, retiredBytes = 0, base, p, zero, target;
  const cleanup = () => {
    if (solver) { solver.dispose(); solver = null; }
    if (backing) { retiredBytes = backing(); backing = null; }
    p = zero = target = null;
    if (!backing && lease) { lease(); lease = null; }
    if (!backing && !lease && retiredBytes) {
      budget.notifyBackingRelease?.('wasm', retiredBytes); retiredBytes = 0;
    }
  };
  try {
    await pause();
    lease ??= budget.reserve(maximum + overhead);
    const levels = new Float64Array(C), counts = new Float64Array(C), contacts = new Uint8Array(C * C);
    zero = new Float64Array(C); target = new Float64Array(C);
    let total = 0, boundaryMembers = 0, inspectedContacts = 0, sinceYield = 0;
    for (let c = 0; c < C; c++) {
      const root = graph.rootAt(c);
      levels[c] = graph.levelAt(root) / 65535;
      counts[c] = graph.countAt(root); total += counts[c];
      zero[c] = zeroAt(c); target[c] = targetAt(c);
      if (!Number.isSafeInteger(counts[c]) || counts[c] < 1) throw fail('MEMORY_OWNERSHIP', 'Invalid native component mass.');
      for (let member = root; member !== 0xffffffff; member = graph.nextMember(member)) {
        boundaryMembers++;
        const x = member % width, y = Math.floor(member / width);
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
          if ((!dx && !dy) || x + dx < 0 || x + dx >= width || y + dy < 0 || y + dy >= height) continue;
          const other = graph.componentAt(member + dy * width + dx); inspectedContacts++;
          if (other !== c) contacts[c * C + other] = 1;
        }
        if (++sinceYield === 4096) { sinceYield = 0; await pause(); }
      }
    }
    if (total !== N) throw fail('MEMORY_OWNERSHIP', 'Native component masses do not cover the source.');
    let E = 0;
    for (let c = 0; c < C; c++) for (let d = c + 1; d < C; d++) if (contacts[c * C + d] || contacts[d * C + c]) E++;
    const low = new Uint32Array(E), high = new Uint32Array(E), difference = new Float64Array(E);
    let at = 0;
    for (let c = 0; c < C; c++) for (let d = c + 1; d < C; d++) if (contacts[c * C + d] || contacts[d * C + c]) {
      if (levels[c] === levels[d]) throw fail('MEMORY_OWNERSHIP', 'Adjacent equal native components must have been merged.');
      const l = levels[c] < levels[d] ? c : d, h = l === c ? d : c;
      low[at] = l; high[at] = h; difference[at++] = levels[h] - levels[l];
    }
    if (E !== graph.edges) throw fail('MEMORY_OWNERSHIP', 'Compact contacts differ from the certified native graph.', {expected: graph.edges, actual: E});
    p = {width, height, levels, counts, low, high, difference};
    solver = await createProjectionOSQP(p, {eps: 1e-11, reduce: true, returnDual: false,
      chunkIterations: 50, memoryBudgetBytes: maximum, signal, cooperate: pause});
    if (solver.memoryBytes) backing = budget.registerBacking?.('wasm', solver.memoryBytes,
      {owner: '7c-native-component-projection', label: 'bounded component QP workspace', identity: solver});
    let projected;
    try {
      projected = await solver.solve(zero, target, {signal, certificateTolerance, onProgress});
    } finally { backing?.resize?.(solver.memoryBytes); }
    const certificate = projected.info.certificateMax;
    if (!Number.isFinite(certificate) || certificate < 0 ||
        certificateTolerance !== undefined && certificate > certificateTolerance) {
      throw fail('NUMERIC_PRECISION', 'Component projection misses its requested certificate.');
    }
    const minimum = Math.min(...levels), maximumLevel = Math.max(...levels);
    let minimumMargin = Infinity;
    // Checking both endpoints proves feasibility of every affine revelation.
    // Equalities are exact because every pixel in a component reads one value.
    for (const values of [projected.z, target]) {
      for (let c = 0; c < C; c++) {
        const value = values[c];
        if (!Number.isFinite(value) || value < 0 || value > 1 || values !== target &&
            (maximumLevel > minimum ? levels[c] === minimum && value !== 0 || levels[c] === maximumLevel && value !== 1 : value !== levels[c])) {
          throw fail('NUMERIC_PRECISION', 'Component result violates a bound or native endpoint anchor.', {component: c, value, level: levels[c], minimum, maximum: maximumLevel, endpoint: values === target ? 'target' : 'base'});
        }
      }
      for (let e = 0; e < E; e++) {
        const margin = values[high[e]] - values[low[e]] - .1 * difference[e];
        minimumMargin = Math.min(minimumMargin, margin);
        if (!(margin >= 0)) throw fail('NUMERIC_PRECISION', 'Component result violates an original native edge.', {edge: e, margin});
      }
    }
    base = await createResidentArray(Float64Array, C, {budget, signal, label: 'certified component revelation baseline'});
    base.write(projected.z);
    const metrics = {...projected.info, backend: 'native-components-osqp-f64', components: C,
      originalEdges: E, boundaryMembers, inspectedContacts, minimumMargin,
      workspaceMaximumBytes: maximum, workspaceAllowanceBytes: overhead,
      baseBytes: 8 * C, graphRebuiltByPixelScan: false};
    cleanup();
    const result = {bank: base, certificate, metrics}; base = null; return result;
  } catch (error) {
    const retry = () => { cleanup(); if (base) { base.dispose(); base = null; } };
    let failure = error;
    try { retry(); }
    catch (cleanupError) {
      if (!failure || typeof failure !== 'object' || !Object.isExtensible(failure)) {
        failure = Object.assign(new AggregateError([error, cleanupError], 'Component projection and retirement failed.', {cause: error}), {code: error?.code ?? 'CLEANUP_FAILED'});
      }
      failure.cleanupError = cleanupError; failure.retryCleanup = retry;
    }
    throw failure;
  }
}
