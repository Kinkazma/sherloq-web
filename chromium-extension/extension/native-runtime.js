// The web diagnostic retry UI is not present in chrome-extension documents.
// Preserve the actual dependency failure instead of masking it with a retry-UI error.
globalThis[Symbol.for('sherloq.runtime.context')]??={session:null,emit(){},retry(_key,error){return Promise.reject(error);}};
if(typeof Worker==='function'){
 const NativeWorker=Worker;
 globalThis.Worker=class extends NativeWorker{constructor(url,options){const value=new URL(url,import.meta.url);super(value.pathname.endsWith('/vendor/unified-engine/src/neural-graph-worker.js')?new URL('./native-neural-worker.js',import.meta.url):url,options);}};
}
