export class EngineError extends Error {
  constructor(code, message) { super(message); this.name = 'EngineError'; this.code = code; }
}
export function requireValue(ok, message) { if (!ok) throw new EngineError('INVALID_INPUT', message); }
export function checkAbort(signal) { if (signal?.aborted) throw new EngineError('CANCELLED', 'Task cancelled.'); }
export async function checkpoint(signal) { checkAbort(signal); if (globalThis.scheduler?.yield) await globalThis.scheduler.yield(); else await new Promise(resolve => setTimeout(resolve, 0)); checkAbort(signal); }

// Resource-owning worker jobs must also admit control-message tasks. A boosted
// scheduler.yield continuation can otherwise outrun a queued cancellation message.
export async function controlCheckpoint(signal){checkAbort(signal);await new Promise(resolve=>setTimeout(resolve,0));checkAbort(signal);}
