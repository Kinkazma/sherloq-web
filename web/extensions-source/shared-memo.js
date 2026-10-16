/** Count backing stores once, including aliased views and cyclic containers. */
export function byteLength(value, seen = new Set()) {
 if (!value || typeof value !== 'object' || seen.has(value)) return 0;
 seen.add(value);
 if (ArrayBuffer.isView(value)) return byteLength(value.buffer, seen);
 if (value instanceof ArrayBuffer || (typeof SharedArrayBuffer !== 'undefined' && value instanceof SharedArrayBuffer)) return value.byteLength;
 const values = value instanceof Map ? [...value.keys(), ...value.values()] : value instanceof Set ? value.values() : Object.values(value);
 let bytes = 0; for (const item of values) bytes += byteLength(item, seen); return bytes;
}
/** Keep physical backing ownership through aliases in cache and active scopes.
 * Policy reservations are separate; a release reports retirement only after
 * the registry's last alias is gone, never merely after the producer returns. */
export function retainBackings(budget, value, {seen = new Set(), owner='extensions', label='memo', reclaimable=false} = {}) {
 const buffers = [], visited = new Set();
 const visit = item => {
  if (!item || typeof item !== 'object' || visited.has(item)) return;
  visited.add(item);
  if (ArrayBuffer.isView(item)) return visit(item.buffer);
  if (item instanceof ArrayBuffer || (typeof SharedArrayBuffer !== 'undefined' && item instanceof SharedArrayBuffer)) {
   if (!seen.has(item)) buffers.push(item); return;
  }
  const values = item instanceof Map ? [...item.keys(), ...item.values()] : item instanceof Set ? item.values() : Object.values(item);
  for (const nested of values) visit(nested);
 };
 visit(value); const owners = []; let closed = false;
 try { for (const buffer of buffers) owners.push({buffer, release:budget.registerBacking?.('array-buffer',buffer.byteLength,{owner,label,identity:buffer,reclaimable})}); }
 catch (error) {for (const owned of owners) owned.release?.();throw error;}
 for (const buffer of buffers) seen.add(buffer);
 return () => {
  if (closed) return; closed = true;
  for (const owned of owners) {const retired=owned.release?.();if(retired>0)budget.notifyBackingRelease?.('array-buffer',retired);}
  owners.length=0;buffers.length=0;visited.clear();
 };
}
const owned = Symbol('SharedMemo owned result');
const abortError = signal => signal?.reason ?? new DOMException('Aborted', 'AbortError');
/** Cached arrays are internal immutable values. Use a scope while consuming
 * them: its leases survive cache eviction. compute receives the shared signal;
 * cancelling one subscriber never cancels another subscriber's useful work. */
export class SharedMemo {
 constructor(budget) {
  this.budget = budget; this.pending = new Map(); this.live = new Set(); this.keys = new Set(); this.epoch = 0; this.closed = false;
  this.metrics = {hits:0, computes:0, joins:0, failed:0};
 }
 /** Retain a producer's existing ownership until cache/consumer hand-off. */
 own(value, release) { return {[owned]:true, value, release}; }
 get(key, compute, {signal, accept} = {}) {
  if (this.closed) return Promise.reject(new Error('Shared memo disposed'));
  if (signal?.aborted) return Promise.reject(abortError(signal));
  const hit = this.budget.get(key);
  if (hit) {
   this.metrics.hits++;
   try { accept?.(hit.value); return Promise.resolve(hit.value); } catch (error) { return Promise.reject(error); }
  }
  let entry = this.pending.get(key);
  if (entry) this.metrics.joins++;
  else {
   this.metrics.computes++;
   entry = {controller:new AbortController(), waiters:new Set(), epoch:this.epoch};
   this.pending.set(key, entry); this.live.add(entry);
   // Deferral registers the first subscriber before synchronous computation.
   Promise.resolve().then(() => {if(entry.controller.signal.aborted)throw abortError(entry.controller.signal);return compute(entry.controller.signal);}).then(produced => {
    if (this.pending.get(key) === entry) this.pending.delete(key);
    const value = produced?.[owned] ? produced.value : produced;
    try {
     // A cancelled/disposed producer must never publish a late successful value.
     if (entry.controller.signal.aborted) throw abortError(entry.controller.signal);
     for (const waiter of [...entry.waiters]) waiter.finish(null, value);
     if (!this.closed && entry.epoch === this.epoch && !entry.controller.signal.aborted) {
      const backing=retainBackings(this.budget,value,{label:key,reclaimable:true});
      const cached = this.budget.put(key, {value, byteLength:byteLength(value), onEvict:() => {this.keys.delete(key);backing();}});
      if (cached) this.keys.add(key);
     }
    } finally { if (produced?.[owned]) produced.release?.(); }
   }).catch(error => {
    this.metrics.failed++;
    if (this.pending.get(key) === entry) this.pending.delete(key);
    for (const waiter of [...entry.waiters]) waiter.finish(error);
   }).finally(() => { if (this.pending.get(key) === entry) this.pending.delete(key); this.live.delete(entry); });
  }
  return new Promise((resolve, reject) => {
   let done = false;
   const waiter = {finish:(error, value) => {
    if (done) return; done = true; entry.waiters.delete(waiter); signal?.removeEventListener('abort', cancel);
    if (!error) try { accept?.(value); } catch (failure) { error = failure; }
    error ? reject(error) : resolve(value);
   }};
   const cancel = () => {
    waiter.finish(abortError(signal));
    if (!entry.waiters.size) {
     entry.controller.abort(abortError(signal));
     if (this.pending.get(key) === entry) this.pending.delete(key);
    }
   };
   entry.waiters.add(waiter); signal?.addEventListener('abort', cancel, {once:true});
   if (signal?.aborted) cancel();
  });
 }
 scope(prefix, {signal} = {}) {
  const releases = [], seen = new Set(), backingSeen = new Set(), controller = new AbortController(); let closed = false;
  const cancel = () => controller.abort(abortError(signal));
  signal?.addEventListener('abort', cancel, {once:true}); if (signal?.aborted) cancel();
  const accept = value => {
   if (closed) throw new DOMException('Memo scope closed', 'AbortError');
   // Do not mark a backing store as owned until admission succeeds.
   const next = new Set(seen), bytes = byteLength(value, next), release = this.budget.reserve(bytes);
   let backing;try{backing=retainBackings(this.budget,value,{seen:backingSeen,label:prefix+'/active'});}catch(error){release();throw error;}
   for (const item of next) seen.add(item); releases.push(()=>{backing();release();});
  };
  return {
   get:(key, compute) => this.get(prefix+'/'+key, compute, {signal:controller.signal, accept}),
   release:() => {
    if (closed) return; closed = true; controller.abort(new DOMException('Memo scope closed', 'AbortError'));
    signal?.removeEventListener('abort', cancel); for (const release of releases.splice(0)) release(); seen.clear();backingSeen.clear();
   },
  };
 }
 clear() {
  this.epoch++;
  for (const key of [...this.keys]) this.budget.remove(key);
  this.keys.clear(); this.pending.clear();
 }
 dispose() {
  if (this.closed) return; this.closed = true;
  for (const entry of this.live) {const error=new DOMException('Memo disposed', 'AbortError');entry.controller.abort(error);for(const waiter of [...entry.waiters])waiter.finish(error);}
  this.clear();
 }
}
