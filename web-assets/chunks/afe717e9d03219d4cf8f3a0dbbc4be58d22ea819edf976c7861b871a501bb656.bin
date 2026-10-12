import {createRgbSurface as rowSurface} from './window-row-reference.js';
import {loadSegmentedJpeg,disposeSegmentedImage} from '../src/image-sources.js';
import {Budget} from '../src/cache.js';
const hash=async bytes=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),x=>x.toString(16).padStart(2,'0')).join('');
onmessage=async({data:{blob}})=>{
 const budget=new Budget(256*1024**2);let source,resident;const cases=[];
 try{
  source=await loadSegmentedJpeg(blob,{budget});resident=budget.reserve(source.metrics.codecHeapCapacityBytes);
  const d=source.surface.descriptor,baseline=rowSurface(source.store,{width:d.sourceWidth,height:d.sourceHeight,budget,ownsStore:false}),paths={rows:baseline,spans:source.surface};
  for(const height of [64,512]){
   const rect={x:0,y:Math.floor(d.height/2),width:d.width,height},samples={rows:[],spans:[]};let checksum;
   for(let repeat=0;repeat<5;repeat++)for(const name of repeat%2?['spans','rows']:['rows','spans']){
    const started=performance.now(),window=await paths[name].readWindow(rect),elapsedMs=performance.now()-started;
    try{const digest=await hash(window.pixels.data);checksum??=digest;if(digest!==checksum)throw Error('Window paths changed pixels');samples[name].push(elapsedMs);}finally{window.release();}
   }
   const median=values=>values.slice().sort((a,b)=>a-b)[2];cases.push({rect,bytes:height*d.width*3,sha256:checksum,samples,medianMs:{rows:median(samples.rows),spans:median(samples.spans)}});
  }
  const backend=source.metrics.temporaryBackend;resident();resident=null;await disposeSegmentedImage(source);source=null;
  postMessage({result:{schema:1,status:'passed',scope:'Development-only alternating isolated window-read comparison; same decoded96MP source, same budget and storage, same output bytes. Includes storage reads/window allocation; excludes load, hashing, UI transfer and display. Five observations per path, no product preflight.',backend,cases,memory:budget.snapshot()}});
 }catch(error){postMessage({error:{message:error.message,code:error.code}});}finally{resident?.();if(source)await disposeSegmentedImage(source);}
};
