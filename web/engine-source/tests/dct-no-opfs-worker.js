// Test environment only: exercise the real worker's IndexedDB fallback.
import '../src/worker.js';
Object.defineProperty(navigator.storage,'getDirectory',{value:undefined,configurable:true});
