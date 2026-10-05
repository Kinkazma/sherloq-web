import '../src/dense-texture-worker.js';
if(new URL(import.meta.url).searchParams.has('fail')){
 // The output bank is supplied by the parent now. Intercept the real native
 // malloc export instead of a removed JS output allocation. Read its generated
 // name so rebuilding Emscripten cannot silently disable this fault injection.
 const loader=await(await fetch('../vendor/dense-regions/dense-regions.js')).text(),symbol=loader.match(/_malloc=wasmExports\["([^"]+)"\]/)?.[1];
 if(!symbol)throw Error('Dense regions malloc export not found');
 let refused=false;
 const wrap=result=>{const exports={...result.instance.exports},malloc=exports[symbol];if(typeof malloc!=='function')throw Error('Dense regions malloc export missing from instance');exports[symbol]=bytes=>{if(!refused&&bytes>4096){refused=true;return 0;}return malloc(bytes);};return {...result,instance:{exports}};};
 for(const key of ['instantiate','instantiateStreaming']){const native=WebAssembly[key];WebAssembly[key]=async(...args)=>wrap(await native(...args));}
}
