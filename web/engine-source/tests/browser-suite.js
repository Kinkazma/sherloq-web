import {createWorkerEngine} from '../src/worker-client.js';
const hash=async b=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',b)),x=>x.toString(16).padStart(2,'0')).join('');
const read=async p=>new Uint8Array(await (await fetch(new URL('../fixtures/'+p,import.meta.url))).arrayBuffer());
const assert=(ok,message)=>{if(!ok)throw new Error(message);};
export async function runBrowserTests(canvas) {
 const e=createWorkerEngine(),start=performance.now();const bytes=await read('synthetic.jpg');
 const reference=await (await fetch(new URL('../fixtures/reference.json',import.meta.url))).json();
 const native=reference.cases[0].expected.find(x=>x.params.scale===50&&!x.params.linear&&!x.params.grayscale);
 const capabilities=await e.capabilities();
 let progress=0;const loaded=await e.load({id:'fixture',bytes,mime:'image/jpeg'});
 const request={id:'cold',imageId:'fixture',operation:'ela.classic',backend:'cpu'};
 const t=performance.now(),cold=await e.run(request,{onProgress:()=>progress++}),rpcColdMs=performance.now()-t;
 assert(await hash(cold.pixels.data)===native.sha256,'Native ELA parity');
 assert(await hash(await e.original('fixture'))===await hash(bytes),'Original byte retention');
 const tw=performance.now(),warm=await e.run({...request,id:'warm'}),rpcWarmMs=performance.now()-tw;
 assert(warm.metrics.cache.result,'Warm result cache');assert(await hash(warm.pixels.data)===native.sha256,'Warm parity');
 const tr=performance.now(),retone=await e.run({...request,id:'retone',params:{scale:37}}),rpcRetoneMs=performance.now()-tr;
 assert(retone.metrics.cache.base,'Changing gain reuses base');
 const rgba=new Uint8ClampedArray(cold.pixels.width*cold.pixels.height*4);
 const td=performance.now();for(let i=0,j=0;i<cold.pixels.data.length;i+=3,j+=4){rgba[j]=cold.pixels.data[i];rgba[j+1]=cold.pixels.data[i+1];rgba[j+2]=cold.pixels.data[i+2];rgba[j+3]=255;}
 canvas.getContext('2d').putImageData(new ImageData(rgba,cold.pixels.width,cold.pixels.height),0,0);await new Promise(requestAnimationFrame);const displayMs=performance.now()-td;
 const c=new AbortController();let cancelled=false;
 try{await e.run({...request,id:'cancel',params:{quality:74}},{signal:c.signal,onProgress:()=>c.abort()});}catch(error){cancelled=error.code==='CANCELLED'&&error.imagesCleared;}
 assert(cancelled,'Worker cancellation terminates and clears images');
 let notFound=false;try{await e.run(request);}catch(error){notFound=error.code==='NOT_FOUND';}assert(notFound,'Cancelled worker must require explicit reload');
 await e.load({id:'fixture',bytes});const recovered=await e.run(request);assert(await hash(recovered.pixels.data)===native.sha256,'Reload after cancellation');
 await e.unload('fixture');e.dispose();
 const large=createWorkerEngine(),largeBytes=await read('bench-1024.jpg');await large.load({id:'large',bytes:largeBytes});
 const abortLarge=new AbortController(),timer=setTimeout(()=>abortLarge.abort(),30);let largeCancelled=false;
 try{await large.run({id:'large-cancel',imageId:'large',operation:'ela.classic'},{signal:abortLarge.signal});}catch(error){largeCancelled=error.code==='CANCELLED';}finally{clearTimeout(timer);large.dispose();}
 assert(largeCancelled,'Cancellation during large-image codec/calibration');
 return {schema:1,status:'passed',fixture:'synthetic.jpg',nativeSha256:native.sha256,exact:true,progressEvents:progress,capabilities,loaded,cold:cold.metrics,warm:warm.metrics,retone:retone.metrics,rpcColdMs,rpcWarmMs,rpcRetoneMs,displayMs,testSuiteMs:performance.now()-start,cancellation:'hard worker termination, explicit reload and large-image cancellation verified',device:{hardwareConcurrency:navigator.hardwareConcurrency,webgpu:!!navigator.gpu,crossOriginIsolated},limits:['Small synthetic fixture; timings are smoke measurements, not performance claims','WordPress integration and other browsers are separate tests']};
}
