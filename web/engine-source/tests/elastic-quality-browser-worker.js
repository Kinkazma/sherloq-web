import {Budget} from '../src/cache.js';
import {getExecutionScheduler} from '../src/execution-scheduler.js';
import {createSegmentedBytes} from '../src/segmented-bytes.js';
import {createRgbSurface} from '../src/rgb-surface.js';
import {createRgbRecompression} from '../src/jpeg-rgb-stream.js';
import {parallelEnergyPlanes} from '../src/energy-stream-pool.js';
import {parallelGhostPlanes} from '../src/ghost-stream-pool.js';
import {parallelStoredGrayLosses} from '../src/jpeg-gray-stream-pool.js';
import {parallelSegmentedLosses} from '../src/segmented-recompression-pool.js';
const assert=(ok,message)=>{if(!ok)throw Error(message);};
self.onmessage=async()=>{try{const records=[];for(const kind of ['energy','ghost','gray','scanline']){
 const budget=new Budget(192*1024**2),scheduler=getExecutionScheduler(budget,{maxWorkers:4}),width=96,height=80,store=await createSegmentedBytes(width*height*3,{budget,storage:'memory'});await store.write(Uint8Array.from({length:store.byteLength},(_,i)=>(i*17+(i>>9)*31)%256));const surface=createRgbSurface(store,{width,height,budget}),image={surface},qualities=[10,30,50,70,90];let competing;
 async function run(elastic){image.rgbRecompression=createRgbRecompression(image,budget);const values=new Map();if(elastic)competing=await scheduler.acquire({cpu:3,bytes:80*1024**2,label:'other-useful-group'});const publish=(q,value)=>{assert(!values.has(q),kind+' published a quality twice');values.set(q,value);competing?.release();competing=null;},options={budget,maxWorkers:elastic?4:1,onQuality:publish,onPlane:async(q,value)=>{if(kind==='energy'){const bytes=new Uint8Array(value.store.byteLength);await value.store.readInto(bytes);await value.dispose();publish(q,bytes);}else publish(q,new Uint8Array(value.buffer.slice(0)));}};let metrics;
 try{if(kind==='energy')metrics=await parallelEnergyPlanes(image,qualities,1,options);else if(kind==='ghost')metrics=await parallelGhostPlanes(image,qualities,1,{...options,phaseX:3,phaseY:5});else if(kind==='gray')metrics=await parallelStoredGrayLosses(image,qualities,1,options);else metrics=(await parallelSegmentedLosses(surface,qualities,1,options)).metrics;return {values,metrics};}finally{competing?.release();competing=null;await image.rgbRecompression.dispose();}}
 try{const serial=await run(false),dynamic=await run(true);assert(dynamic.metrics.elastic.batchWorkers.join(',')==='1,4',kind+' did not grow from 1 to 4: '+dynamic.metrics.elastic.batchWorkers);assert(dynamic.metrics.recompressions===5&&dynamic.metrics.sourcePasses===4,kind+' repeated or skipped useful work');for(const q of qualities){const a=serial.values.get(q),b=dynamic.values.get(q);assert(typeof a==='number'?a===b:a.every((v,i)=>v===b[i]),kind+' changed bytes at '+q);}records.push({kind,exactQualities:qualities.length,elastic:dynamic.metrics.elastic,sourcePasses:dynamic.metrics.sourcePasses});}finally{await surface.dispose();}assert(budget.total()===0,kind+' budget leaked');assert(scheduler.used.cpu===0,kind+' CPU leaked');
 }self.postMessage({result:records});}catch(error){self.postMessage({error:{message:error.message,stack:error.stack}});}};
