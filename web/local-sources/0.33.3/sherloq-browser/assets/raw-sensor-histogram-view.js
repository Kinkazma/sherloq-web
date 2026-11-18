import {requireValue, checkAbort} from './unified-engine/src/errors.js';

// The consumer owns its SourceSamples receipts. This view owns only the
// completed aggregate and the consumer's retryable retirement handle.
export function createRawSensorHistogramView({read, onChange}) {
  let identity = null;
  let selected = false;
  let closed = false;
  let flight = null;
  let ready = null;
  let failure = null;
  let retirement = null;
  const retiring = new Set();

  function discard() {
    if (ready) retiring.add(ready.owner);
    ready = null;
  }

  function retire() {
    if (retirement) return retirement;
    const task = (async () => {
      for (const owner of retiring) {
        const acknowledgement = await owner.dispose();
        if (acknowledgement === false || acknowledgement === 0) throw acknowledgement;
        retiring.delete(owner);
      }
    })();
    retirement = task;
    task.then(() => {retirement = null;}, () => {retirement = null;});
    return task;
  }

  function start() {
    if (closed || !selected || identity === null || ready || flight || failure || !read) return;
    const job = {identity, controller: new AbortController(), done: null};
    const {signal} = job.controller;
    const current = () => !closed && selected && identity === job.identity && !signal.aborted;
    flight = job;
    job.done = (async () => {
      try {
        await retire();
        checkAbort(signal);
        const owner = await read({signal});
        // Adopt before inspecting or discarding any completed result.
        if (typeof owner?.dispose === 'function') retiring.add(owner);
        checkAbort(signal);
        const data = owner?.data;
        const grid = data?.source;
        requireValue(retiring.has(owner) && grid?.domain === 'sensor' && grid.orientation === 1
          && Number.isSafeInteger(grid.width) && grid.width > 0
          && Number.isSafeInteger(grid.height) && grid.height > 0 && data.total === grid.width * grid.height,
        'The chart needs a completed whole sensor histogram.');
        retiring.delete(owner);
        ready = {owner, entry: {
          rect: {x: 0, y: 0, width: grid.width, height: grid.height},
          data: {...data, space: 'SENSOR', depth: grid.containerBits, channelMeans: data.summaries.map(value => value.mean)},
        }};
      } catch (error) {
        if (typeof error?.cleanupOwner?.dispose === 'function') retiring.add(error.cleanupOwner);
        if (current()) failure = {code: error?.code, message: String(error?.message ?? error)};
      } finally {
        if (!current()) {
          // Stale owners never publish. A refusal stays attached for disposal.
          try {await retire();} catch {}
        }
        flight = null;
        if (!closed) {
          onChange();
          if (!current()) start();
        }
      }
    })();
    void job.done.catch(() => {});
  }

  return {
    get entry() {return selected ? ready?.entry ?? null : null;},
    get error() {return selected ? failure : null;},
    get pending() {return selected && flight !== null;},
    update(nextIdentity, nextSelected) {
      if (closed) return;
      if (nextIdentity !== identity) {
        flight?.controller.abort();
        discard();
        identity = nextIdentity;
        failure = null;
        if (retiring.size) void retire().catch(() => {});
      }
      if (nextSelected !== selected) {
        selected = nextSelected;
        failure = null;
        if (!selected) flight?.controller.abort();
      }
      start();
    },
    async dispose() {
      closed = true;
      selected = false;
      flight?.controller.abort();
      if (flight) await Promise.allSettled([flight.done]);
      discard();
      await retire();
    },
  };
}
