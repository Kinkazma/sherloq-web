import test from 'node:test';
import assert from 'node:assert/strict';
import {Budget} from '../src/cache.js';
import {createSegmentedBytes} from '../src/segmented-bytes.js';
import {createRgbSurface} from '../src/rgb-surface.js';
import {equalizationSurface,prepareEqualization} from '../src/equalization-presentation.js';
import {equalizationPlan,equalizationState} from '../src/equalization-settings.js';

const state=equalizationState();state.method='histogram';
const plan=equalizationPlan('ela.classic',{quality:75,scale:1,contrast:0,linear:false,grayscale:false,equalization:state});
async function fixture(width,height,limit=16*1024**2){
 const budget=new Budget(limit),data=Uint8Array.from({length:width*height*3},(_,i)=>(i*37+(i>>>3)*19)%256),store=await createSegmentedBytes(data.length,{budget,storage:'memory'});await store.write(data);return{budget,data,source:createRgbSurface(store,{width,height,budget})};
}
for(const [width,height,limit]of [[7,9,16*1024**2],[513,35,16*1024**2],[1537,69,16*1024**2],[22001,2,512*1024]])for(const masked of [false,true])test('global Histogram100 matches historical mapping at '+width+'x'+height+(masked?' with exclusions':''),async()=>{
 const f=await fixture(width,height,limit);let actual,program;
 const contains=masked?(x,y)=>x%13!==3&&(y%7!==2||x%3!==0):undefined;
 try{
  program=await prepareEqualization(f.source,plan,{budget:f.budget,...(contains?{contains}:{})});
  const expected=f.data.slice();program.map(expected,0,0,width,height);program.dispose();program=null;
  actual=await equalizationSurface(f.source,plan,{budget:f.budget,...(contains?{contains}:{})});
  const window=await actual.surface.readWindow({x:0,y:0,width,height});try{assert.deepEqual(window.pixels.data,expected);}finally{await window.release();}
  assert.equal(actual.metrics.equalization.traversal,'contiguous-native-bands');
  assert(actual.metrics.equalization.storeWrites<=(width>20000?6:2),'Bounded bands avoid the historical per-row writes.');
  const original=await f.source.readWindow({x:0,y:0,width,height});try{assert.deepEqual(original.pixels.data,f.data);}finally{await original.release();}
 }finally{program?.dispose();await actual?.surface.dispose();await f.source.dispose();assert.equal(f.budget.total(),0);}
});

for(const phase of ['equalization-statistics','equalization-render'])test('abort during '+phase+' retires the unfinished output and retains Original',async()=>{
 const f=await fixture(81,67),controller=new AbortController();
 try{
  await assert.rejects(equalizationSurface(f.source,plan,{budget:f.budget,signal:controller.signal,onProgress:event=>{if(event.phase===phase)controller.abort();}}),{code:'CANCELLED'});
  assert.equal(f.budget.total(),f.data.length);
  const read=await f.source.readWindow({x:0,y:0,width:81,height:67});try{assert.deepEqual(read.pixels.data,f.data);}finally{await read.release();}
 }finally{await f.source.dispose();assert.equal(f.budget.total(),0);}
});

test('native window release ACK completes before the next read or publication',async()=>{
 const f=await fixture(513,701),original=f.source.readWindow.bind(f.source);let borrowed=0,reads=0;
 f.source.readWindow=async(...args)=>{assert.equal(borrowed,0);const part=await original(...args);borrowed++;reads++;const release=part.release;part.release=async()=>{await new Promise(setImmediate);release();borrowed--;};return part;};
 let answer;try{answer=await equalizationSurface(f.source,plan,{budget:f.budget});assert.equal(borrowed,0);assert(reads>=4);}finally{await answer?.surface.dispose();await f.source.dispose();assert.equal(f.budget.total(),0);}
});

test('an exclusion predicate can revoke a large band before its statistics or output are published',async()=>{
 const f=await fixture(137,83),controller=new AbortController();let calls=0;
 try{await assert.rejects(equalizationSurface(f.source,plan,{budget:f.budget,signal:controller.signal,contains:()=>{if(++calls===100)controller.abort();return true;}}),{code:'CANCELLED'});assert(calls<137*83);assert.equal(f.budget.total(),f.data.length);}
 finally{await f.source.dispose();assert.equal(f.budget.total(),0);}
});
