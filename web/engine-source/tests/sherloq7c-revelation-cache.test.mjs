import test from 'node:test';
import assert from 'node:assert/strict';
import {Budget} from '../src/cache.js';
import {EngineError} from '../src/errors.js';
import {createSherloqRevelationCache} from '../src/sherloq7c-revelation-cache.js';
import {sherloq7cWindowRecords} from '../src/sherloq7c-window-records.js';

// Protocol fixtures only. Real-image byte comparisons and performance belong
// to the product qualification, not to these ownership/formula unit tests.
function fixture({kind='pixel',maximumBytes=1024*1024,limit=1024*1024}={}){
 const budget=new Budget(limit),cache=createSherloqRevelationCache({budget,maximumBytes});
 const width=4,height=2,source={width:8,height:4};
 const rgb=new Uint16Array([0,0,0,65535,40000,1000,100,4000,28000,32767,32768,32769,300,900,800,65535,65535,65535,17,29,201,30000,60000,20000]);
 const zero=new Float64Array([.1,.4,.25,.8,.2,.75,.37,.4]),one=new Float64Array([.9,.8,.25,.1,.75,.4,.6,.9]);
 const counts={prepared:0,sourceReleases:0,runs:0,reads:0,endpointReleases:0,resultReleases:0,windowReleases:0};
 let failPrepare,failRead,failWindowRelease=0,failEndpointRelease=0;
 const micro=kind==='zero-micro'?0:1;
 const scalar=(i,r)=>r===0?zero[i]:kind==='zero-micro'?(1-r)*zero[i]+r*one[i]:r===1||kind==='component'&&zero[i]===one[i]?one[i]:(1-r)*zero[i]+r*one[i];
 function make(r,{hit=true,range=true,endpoint=false}={}){
  let released=false;
  return {width,height,bitDepth:16,metrics:{backend:kind==='component'?'native-component-target-projection':'native-compact-target-forest-arena',micro,revelation:r,reuse:{stateHit:hit},preparedTargets:[{micro}],...(range?{preparedRevelationRange:[0,1]}:{}),work:{sourcePasses:0,targetSolves:0,projections:0}},
   async readWindow({x=0,y=0,width:w,height:h},{format='rgb16',includeScalar=false,signal}={}){
    if(signal?.aborted)throw new EngineError('CANCELLED','stopped');if(failRead)throw failRead;assert.equal(released,false);counts.reads++;
    const data=format==='rgb8'?new Uint8Array(3*w*h):new Uint16Array(3*w*h),values=includeScalar?new Float64Array(w*h):null;
    for(let row=0;row<h;row++)for(let col=0;col<w;col++){
     const i=(y+row)*width+x+col,at=row*w+col,a=rgb[3*i],b=rgb[3*i+1],c=rgb[3*i+2],v=Math.max(a,b,c)/65535,z=scalar(i,r),gain=v?z/v:0;
     if(values)values[at]=v?z:0;
     for(let channel=0;channel<3;channel++)data[3*at+channel]=Math.max(0,Math.min(format==='rgb8'?255:65535,Math.round(format==='rgb8'?rgb[3*i+channel]*gain/257:rgb[3*i+channel]*gain)));
    }
    let live=true;return {x,y,width:w,height:h,format,data,scalar:values,byteLength:data.byteLength+(values?.byteLength??0),release(){if(failWindowRelease){failWindowRelease--;throw new Error('window retirement refused');}if(live){live=false;counts.windowReleases++;}}};
   },async release(){if(endpoint&&failEndpointRelease){failEndpointRelease--;throw new Error('endpoint retirement refused');}if(!released){released=true;counts[endpoint?'endpointReleases':'resultReleases']++;}}};
 }
 const params=r=>({revelation:r,micro,precision:'1e-2',maxSide:512,computationMode:'fast'});
 function wrap(r,options={}){return cache.wrap(make(r,options),{source,params:params(r),
  getPreparedSource(){counts.prepared++;let live=true;return{width,height,immutable:true,nativeBitDepth:16,readRgb16Span(target,first=0){assert.equal(live,true);target.set(rgb.subarray(first,first+target.length));},release(){if(live){live=false;counts.sourceReleases++;}}};},
  async prepareEndpoint(value){counts.runs++;const failure=typeof failPrepare==='function'?await failPrepare(value,counts.runs):failPrepare;if(failure)throw failure;return make(value,{endpoint:true});}
 });}
 return {cache,budget,counts,wrap,make,width,height,rect:{x:0,y:0,width,height},
  failPrepare(error){failPrepare=error;},failRead(error){failRead=error;},failWindowRelease(n){failWindowRelease=n;},failEndpointRelease(n){failEndpointRelease=n;}};
}

for(const kind of ['pixel','component','zero-micro'])test('RGB8 uses the frozen '+kind+' scalar expression and shares warm bases',async()=>{
 const f=fixture({kind});
 for(const r of [0,.125,.5,.913,1]){
  const result=f.wrap(r),actual=await result.readWindow(f.rect,{format:'rgb8'}),reference=f.make(r),expected=await reference.readWindow(f.rect,{format:'rgb8'});
  assert.deepEqual(actual.data,expected.data);actual.release();actual.release();await result.release();await reference.release();
 }
 assert.equal(f.counts.runs,2);assert.equal(f.counts.prepared,1);assert.equal(f.counts.endpointReleases,2);assert.equal(f.counts.sourceReleases,1);
 assert.equal(f.cache.memory().bytes,22*f.width*f.height);assert.equal(f.budget.total(),22*f.width*f.height);
 await f.cache.dispose();assert.equal(f.budget.total(),0);
});

test('one facade prepares two endpoints once across separate row windows',async()=>{
 const f=fixture(),result=f.wrap(.4);
 for(let y=0;y<2;y++){const window=await result.readWindow({x:0,y,width:4,height:1},{format:'rgb8'});window.release();}
 assert.equal(f.counts.runs,2);assert.equal(f.counts.prepared,1);assert.equal(f.counts.reads,4);
 assert.equal(f.counts.endpointReleases,0);await result.release();assert.equal(f.counts.endpointReleases,2);await f.cache.dispose();assert.equal(f.budget.total(),0);
});

test('scalar and RGB16 paths do not acquire endpoints or a prepared-source lease',async()=>{
 const f=fixture(),result=f.wrap(.4);
 for(const options of [{format:'rgb16'},{format:'rgb8',includeScalar:true}]){const window=await result.readWindow(f.rect,options);window.release();}
 assert.equal(f.counts.runs,0);assert.equal(f.cache.memory().bytes,0);await result.release();await f.cache.dispose();
});

test('unprepared ranges stay on the existing reader',async()=>{
 const f=fixture(),result=f.wrap(.4,{range:false});const window=await result.readWindow(f.rect,{format:'rgb8'});window.release();
 assert.equal(f.counts.runs,0);await result.release();await f.cache.dispose();
});

test('a rebuilt scientific family invalidates its old RGB8 basis',async()=>{
 const f=fixture(),first=f.wrap(.4);(await first.readWindow(f.rect,{format:'rgb8'})).release();await first.release();
 const rebuilt=f.wrap(.5,{hit:false});(await rebuilt.readWindow(f.rect,{format:'rgb8'})).release();await rebuilt.release();
 assert.equal(f.counts.runs,4);assert.equal(f.cache.memory().entries,1);await f.cache.dispose();assert.equal(f.budget.total(),0);
});

test('cache size and policy pressure decline optional construction',async()=>{
 const f=fixture({maximumBytes:22*8-1}),result=f.wrap(.4);(await result.readWindow(f.rect,{format:'rgb8'})).release();
 assert.equal(f.counts.runs,0);assert.equal(f.cache.memory().bytes,0);await result.release();await f.cache.dispose();
 const g=fixture(),recovery=g.budget.beginRecovery({kind:'array-buffer'}),other=g.wrap(.4);
 (await other.readWindow(g.rect,{format:'rgb8'})).release();assert.equal(g.counts.runs,0);recovery();await other.release();await g.cache.dispose();
});

test('an allocation refusal falls back without hiding scientific errors',async()=>{
 const f=fixture({limit:100}),result=f.wrap(.4);(await result.readWindow(f.rect,{format:'rgb8'})).release();
 assert.equal(f.budget.total(),0);assert.equal(f.counts.runs,0);await result.release();await f.cache.dispose();
 const g=fixture(),error=new EngineError('NUMERIC_PRECISION','scientific refusal');g.failPrepare(error);const bad=g.wrap(.4);
 await assert.rejects(bad.readWindow(g.rect,{format:'rgb8'}),value=>value===error);assert.equal(g.budget.total(),0);assert.equal(g.counts.sourceReleases,1);await bad.release();await g.cache.dispose();
});

test('cache reclamation releases idle bases while live surfaces remain usable',async()=>{
 const f=fixture(),result=f.wrap(.4),window=await result.readWindow(f.rect,{format:'rgb8'});window.release();
 const free=f.budget.reserve(f.budget.limit-20);assert.equal(f.cache.memory().bytes,0);free();
 await f.cache.dispose();assert.equal(f.counts.endpointReleases,2);assert.equal(f.counts.resultReleases,0);
 const next=await result.readWindow(f.rect,{format:'rgb8'});next.release();await result.release();assert.equal(f.budget.total(),0);
});

test('aborted reads do not prepare or retain an optional basis',async()=>{
 const f=fixture(),result=f.wrap(.4),controller=new AbortController();controller.abort();
 await assert.rejects(result.readWindow(f.rect,{format:'rgb8',signal:controller.signal}),{code:'CANCELLED'});
 assert.equal(f.counts.runs,0);assert.equal(f.budget.total(),0);await result.release();await f.cache.dispose();
});

test('failed endpoint-window retirement remains owned until retry',async()=>{
 const f=fixture(),result=f.wrap(.4);f.failWindowRelease(1);
 await assert.rejects(result.readWindow(f.rect,{format:'rgb8'}),error=>error.code==='CLEANUP_FAILED'&&typeof error.retryCleanup==='function');
 assert.equal(f.cache.memory().bytes,0);await result.release();assert.equal(f.counts.windowReleases,1);assert.equal(f.counts.endpointReleases,2);await f.cache.dispose();assert.equal(f.budget.total(),0);
});

test('failed endpoint retirement can be retried without losing its owner',async()=>{
 const f=fixture(),result=f.wrap(.4);(await result.readWindow(f.rect,{format:'rgb8'})).release();f.failEndpointRelease(1);
 await assert.rejects(result.release(),{code:'CLEANUP_FAILED'});assert.equal(f.counts.resultReleases,0);await result.release();
 assert.equal(f.counts.endpointReleases,2);assert.equal(f.counts.sourceReleases,1);assert.equal(f.counts.resultReleases,1);await f.cache.dispose();assert.equal(f.budget.total(),0);
});

test('a busy optional core declines the cache and leaves the valid frozen reader usable',async()=>{
 const f=fixture(),result=f.wrap(.4);f.failPrepare(new EngineError('BUSY','another core run'));
 (await result.readWindow(f.rect,{format:'rgb8'})).release();assert.equal(f.counts.sourceReleases,1);assert.equal(f.cache.memory().bytes,0);
 await result.release();await f.cache.dispose();assert.equal(f.budget.total(),0);
});

test('partial endpoint acquisition retains failed retirement owners for retry',async()=>{
 const f=fixture(),result=f.wrap(.4),failure=new EngineError('NUMERIC_PRECISION','second endpoint refused');
 f.failPrepare(value=>value===1?failure:null);f.failEndpointRelease(1);
 await assert.rejects(result.readWindow(f.rect,{format:'rgb8'}),error=>error.cause===failure&&typeof error.retryCleanup==='function');
 assert.equal(f.counts.endpointReleases,0);await result.release();assert.equal(f.counts.endpointReleases,1);assert.equal(f.counts.sourceReleases,1);await f.cache.dispose();assert.equal(f.budget.total(),0);
});

test('RGB8 window retirement remains retryable until backing acknowledgement',async()=>{
 const f=fixture(),register=f.budget.registerBacking.bind(f.budget);let refuse=true;
 f.budget.registerBacking=(kind,bytes,options)=>{const release=register(kind,bytes,options);return()=>{if(refuse&&options.label==='revelation RGB8 window'){refuse=false;throw new Error('backing busy');}return release();};};
 const result=f.wrap(.4),window=await result.readWindow(f.rect,{format:'rgb8'});
 assert.throws(()=>window.release(),/backing busy/);assert.ok(window.data);window.release();assert.equal(window.data,null);
 await result.release();await f.cache.dispose();assert.equal(f.budget.total(),0);
});

test('a newer live read retries construction cancelled by an older reader',async()=>{
 const f=fixture(),result=f.wrap(.4),old=new AbortController();let unblock,entered;
 const started=new Promise(resolve=>{entered=resolve;}),gate=new Promise(resolve=>{unblock=resolve;});
 f.failPrepare(async(value,runs)=>{if(runs===1){entered();await gate;return new EngineError('CANCELLED','old gesture stopped');}});
 const older=result.readWindow(f.rect,{format:'rgb8',signal:old.signal});await started;
 const newer=result.readWindow(f.rect,{format:'rgb8'});old.abort();unblock();await assert.rejects(older,{code:'CANCELLED'});
 const window=await newer;assert.ok(window.data);window.release();assert.equal(f.cache.memory().entries,1);await result.release();await f.cache.dispose();assert.equal(f.budget.total(),0);
});

test('strided samples preserve nonzero origins and edge ceil geometry while caching contributing texels only',async()=>{
 const f=fixture(),tiles=[{x:1,y:0,w:3,h:2,step:2},{x:1,y:1,w:3,h:1,step:2},{x:0,y:0,w:4,h:2,step:3}];
 for(const r of [.37,.81]){
  const result=f.wrap(r),reference=f.make(r),whole=await reference.readWindow(f.rect,{format:'rgb8'});
  for(const tile of tiles){
   const sample=await result.readSampledWindow(tile),expected=[];
   for(let y=tile.y;y<tile.y+tile.h;y+=tile.step)for(let x=tile.x;x<tile.x+tile.w;x+=tile.step)for(let c=0;c<3;c++)expected.push(whole.data[3*(y*f.width+x)+c]);
   assert.equal(sample.pixels.width,Math.ceil(tile.w/tile.step));assert.equal(sample.pixels.height,Math.ceil(tile.h/tile.step));assert.deepEqual([...sample.pixels.data],expected);sample.release();
  }
  whole.release();await reference.release();await result.release();
 }
 assert.equal(f.counts.runs,2);assert.equal(f.counts.prepared,1);assert.equal(f.cache.memory().bytes,6*22);assert.equal(f.counts.reads,8);
 await f.cache.dispose();assert.equal(f.budget.total(),0);
});

test('strided cache refusal uses exact existing source rows without optional endpoints',async()=>{
 const f=fixture({maximumBytes:0}),result=f.wrap(.37),sample=await result.readSampledWindow({x:1,y:0,w:3,h:2,step:2});
 assert.equal(sample.pixels.width,2);assert.equal(sample.pixels.height,1);sample.release();assert.equal(f.counts.runs,0);assert.equal(f.counts.reads,1);await result.release();await f.cache.dispose();assert.equal(f.budget.total(),0);
});

test('sampled step one and ordinary RGB8 reads share the same basis',async()=>{
 const f=fixture(),first=f.wrap(.37);(await first.readSampledWindow({x:0,y:0,w:4,h:2,step:1})).release();await first.release();
 const second=f.wrap(.81);(await second.readWindow(f.rect,{format:'rgb8'})).release();assert.equal(f.counts.runs,2);assert.equal(f.counts.reads,2);await second.release();await f.cache.dispose();assert.equal(f.budget.total(),0);
});

test('a live sampled reader retries a cancelled shared sample once',async()=>{
 const f=fixture(),first=f.wrap(.37),second=f.wrap(.81),old=new AbortController(),tile={x:1,y:0,w:3,h:2,step:2};let unblock,entered;
 const started=new Promise(resolve=>{entered=resolve;}),gate=new Promise(resolve=>{unblock=resolve;});
 f.failPrepare(async(value,runs)=>{if(runs===1){entered();await gate;return new EngineError('CANCELLED','old sampled gesture stopped');}});
 const older=first.readSampledWindow(tile,{signal:old.signal});await started;
 const newer=second.readSampledWindow(tile);old.abort();unblock();await assert.rejects(older,{code:'CANCELLED'});
 const sample=await newer;assert.equal(sample.pixels.width,2);sample.release();assert.equal(f.counts.runs,3);assert.equal(f.cache.memory().entries,1);
 await first.release();await second.release();await f.cache.dispose();assert.equal(f.budget.total(),0);
});

test('the 512 MiB optional default reserves nothing before a read and still obeys a smaller parent budget',async()=>{
 const budget=new Budget(100),cache=createSherloqRevelationCache({budget});
 assert.equal(cache.memory().maximumBytes,512*1024*1024);assert.equal(budget.total(),0);
 const f=fixture(),source={};let prepared=0;
 const result=cache.wrap(f.make(.4),{source,params:{micro:1,revelation:.4},prepareEndpoint(){prepared++;throw new Error('parent admission must precede endpoint preparation');},getPreparedSource(){throw new Error('no lease is needed after parent refusal');}});
 const window=await result.readWindow(f.rect,{format:'rgb8'});window.release();
 assert.equal(prepared,0);assert.equal(budget.total(),0);assert.equal(cache.memory().bytes,0);await result.release();await cache.dispose();await f.cache.dispose();
});

test('real window records finish custom RGB8 samples and keep the result alive through release acknowledgement',async()=>{
 const budget=new Budget(1024),tile={x:0,y:0,w:4,h:2,step:2};let acknowledge,resultReleases=0,sampleReleases=0,finished=false;
 const ack=new Promise(resolve=>{acknowledge=resolve;});
 const result={width:4,height:2,metrics:{},async readWindow(){assert.fail('custom RGB8 sampling must not reread the frozen result');},
  async readSampledWindow(actual){assert.deepEqual(actual,tile);return{pixels:{width:2,height:1,format:'rgb8',data:new Uint8Array([0,100,101,200,255,50])},metrics:{sourceBytes:6},async release(){sampleReleases++;await ack;}};},
  async release(){resultReleases++;}};
 const records=sherloq7cWindowRecords(result,budget,{threshold:100,invert:true}),sample=await records.surface.readSampledWindow(tile);
 assert.deepEqual([...sample.pixels.data],[255,255,0,0,0,255]);
 await records.planeRecords.intensity.surface.dispose();await records.planeRecords.rgb16.surface.dispose();
 const disposing=records.surface.dispose().then(()=>{finished=true;});await Promise.resolve();assert.equal(finished,false);assert.equal(resultReleases,0);
 const retirement=sample.release();await Promise.resolve();assert.equal(sampleReleases,1);assert.equal(finished,false);assert.equal(resultReleases,0);
 acknowledge();await retirement;await disposing;assert.equal(resultReleases,1);assert.equal(budget.total(),0);
});

test('real scalar and native16 window records retain the frozen sampled readers instead of the RGB8 shortcut',async()=>{
 const budget=new Budget(1024),calls=[],tile={x:1,y:0,w:3,h:2,step:2};let windowsReleased=0,resultReleases=0;
 const result={width:4,height:2,metrics:{},async readSampledWindow(){assert.fail('scalar and native16 must never use the RGB8 shortcut');},
  async readWindow(rect,options){calls.push({rect,options});return{data:options.format==='rgb16'?new Uint16Array([257,514,771,1028,1285,1542,1799,2056,2313]):new Uint8Array(9),scalar:options.includeScalar?new Float64Array([.1,.2,.3]):null,release(){windowsReleased++;}};},
  async release(){resultReleases++;}};
 const records=sherloq7cWindowRecords(result,budget),scalar=await records.planeRecords.intensity.surface.readSampledWindow(tile),native=await records.planeRecords.rgb16.surface.readSampledWindow(tile);
 assert.deepEqual([...scalar.pixels.data],[.1,.3]);assert.deepEqual([...native.pixels.data],[257,514,771,1799,2056,2313]);
 assert.equal(calls.length,2);assert.deepEqual(calls.map(call=>[call.options.format,call.options.includeScalar]),[['rgb8',true],['rgb16',false]]);
 for(const call of calls)assert.deepEqual(call.rect,{x:1,y:0,width:3,height:1});assert.equal(windowsReleased,2);
 scalar.release();native.release();await records.surface.dispose();await records.planeRecords.intensity.surface.dispose();await records.planeRecords.rgb16.surface.dispose();
 assert.equal(resultReleases,1);assert.equal(budget.total(),0);
});
