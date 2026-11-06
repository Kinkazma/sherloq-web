import test from 'node:test';
import assert from 'node:assert/strict';
import {prepareEnergy} from '../src/energy-prepare.js';
const keys=['energy_low_score','energy_high_score','energy_scope'];
const bytes=a=>new Uint8Array(a.buffer,a.byteOffset,a.byteLength);
function fixture(planeCount=3){
 const width=33,height=17,n=width*height,data=Uint8Array.from({length:3*n},(_,i)=>i%51===0?0:80+i%90),planes=Float32Array.from({length:planeCount*n},(_,i)=>i%37===0?-0:Math.fround(((i*7)%19)/7)),scope=Int32Array.from({length:n},(_,i)=>i%41===0?0:i%width<17?7:23),polygons=[[[0,0],[32,0],[32,16],[0,16]],[[0,0],[32,0],[32,16],[0,16]]];
 return{image:{width,height,format:'rgb8',data},planes,options:{planeCount,minimumPanelSamples:1,draftSourceScope:scope,panelIds:[7,23],panelDetector:async()=>polygons}};
}
function exact(actual,expected){for(const key of keys)assert.deepEqual(bytes(actual[key]),bytes(expected[key]),key);assert.deepEqual(actual.energy_summary,expected.energy_summary);}
test('opt-in score memoization keeps every output byte, panel statistic and account request for 1/3 planes and both rank/statistics routes',async()=>{
 for(const planeCount of[1,3])for(const rankSelection of[true,false])for(const arrayStatistics of[true,false]){
  const{image,planes,options}=fixture(planeCount),original=bytes(planes).slice(),accounts=[[],[]],counts=[0,0];
  const baseline=await prepareEnergy(image,planes,[.06,.598],x=>{counts[0]++;return Math.log(x);},{...options,rankSelection,arrayStatistics,account:n=>accounts[0].push(n)});
  const memo=await prepareEnergy(image,planes,[.06,.598],x=>{counts[1]++;return Math.log(x);},{...options,rankSelection,arrayStatistics,scoreMemoization:true,account:n=>accounts[1].push(n)});
  exact(memo,baseline);assert.deepEqual(accounts[1],accounts[0]);assert.deepEqual(bytes(planes),original);assert.ok(counts[1]<counts[0]/2);
 }
});
test('arbitrary logarithms keep historical invocation order and count unless the caller explicitly opts in',async()=>{
 const{image,planes,options}=fixture(1),sequences=[[],[]];
 const a=await prepareEnergy(image,planes,[0,1],x=>{sequences[0].push(x);return Math.log(x)+sequences[0].length/1000;},options);
 const b=await prepareEnergy(image,planes,[0,1],x=>{sequences[1].push(x);return Math.log(x)+sequences[1].length/1000;},{...options,scoreMemoization:false});
 exact(a,b);assert.deepEqual(sequences[0],sequences[1]);
});
test('all-distinct energies and direct-cache collisions remain exact, including adjacent Float32 bit patterns',async()=>{
 const width=513,height=1,n=width*height,data=new Uint8Array(n*3).fill(100),buffer=new ArrayBuffer(n*4),words=new Uint32Array(buffer);
 for(let i=0;i<n;i++)words[i]=0x3f000000+i*997;
 const planes=new Float32Array(buffer),image={width,height,format:'rgb8',data},options={planeCount:1,minimumPanelSamples:1,panelDetector:async()=>[]},a=await prepareEnergy(image,planes,[.1,.9],Math.log,options),b=await prepareEnergy(image,planes,[.1,.9],Math.log,{...options,scoreMemoization:true});exact(a,b);
});
test('memo scratch is reset for each panel, each plane and each quantile call, including overlapping unscoped overwrite order',async()=>{
 const{image,planes,options}=fixture(),polygons=[[[0,0],[20,0],[20,16],[0,16]],[[8,0],[32,0],[32,16],[8,16]]],all={...options,draftSourceScope:undefined,panelIds:undefined,panelDetector:async()=>polygons};
 for(const bounds of[[0,1],[.4,.6],[.01,.99],[0,1]])exact(await prepareEnergy(image,planes,bounds,Math.log,{...all,scoreMemoization:true}),await prepareEnergy(image,planes,bounds,Math.log,all));
});
test('bit validation accepts exactly finite RGB8 residuals and -0 through a byte-offset Float32 view',async()=>{
 const accepted=[0,0x80000000,1,0x007fffff,0x00800000,0x3f800000,0x437effff,0x437f0000],rejected=[0x437f0001,0x7f7fffff,0x7f800000,0xff800000,0x7fc00000,0xffc00000,0x7f800001,0xff800001,0x80000001,0xbf800000,0xffffffff];
 for(const word of[...accepted,...rejected]){
  const buffer=new ArrayBuffer(12),all=new Uint32Array(buffer);all.fill(0x7fc00000);all[1]=word;let panels=0;
  const run=prepareEnergy({width:1,height:1,format:'rgb8',data:Uint8Array.of(90,90,90)},new Float32Array(buffer,4,1),[0,1],Math.log,{planeCount:1,minimumPanelSamples:1,panelDetector:async()=>{panels++;return[];},scoreMemoization:true});
  if(accepted.includes(word)){await run;assert.equal(panels,1);}else{await assert.rejects(run,{code:'INVALID_INPUT'});assert.equal(panels,0);}
 }
});
test('input validation checks excluded/outside-panel samples and aborts after statistics without changing source or ownership',async()=>{
 const{image,planes,options}=fixture(),controller=new AbortController(),original=bytes(planes).slice();let logs=0;
 await assert.rejects(prepareEnergy(image,planes,[.1,.9],x=>{logs++;return Math.log(x);},{...options,scoreMemoization:true,signal:controller.signal,onTiming:phase=>{if(phase==='energyStatisticsMs')controller.abort();}}),{code:'CANCELLED'});
 assert.equal(logs,0);assert.deepEqual(bytes(planes),original);planes[planes.length-1]=NaN;
 await assert.rejects(prepareEnergy(image,planes,[.1,.9],Math.log,{...options,scoreMemoization:true,panelDetector:async()=>[[[0,0],[1,0],[1,1],[0,1]]]}),{code:'INVALID_INPUT'});
});
test('GPU score provider retains its original inputs and one invocation when memoization is requested',async()=>{
 const{image,planes,options}=fixture(),original=bytes(planes).slice();let runs=0;
 const provider={selectBackend:()=> 'webgpu',async runScores(p,scope,summary,{low,high,planeCount}){runs++;assert.equal(p,planes);assert.equal(planeCount,3);assert.ok(summary.length);low.fill(2);high.fill(3);return{backend:'webgpu-fake',totalMs:1};}};
 const result=await prepareEnergy(image,planes,[.1,.9],()=>assert.fail('CPU score logarithm must not run'),{...options,scoreMemoization:true,scoreGpu:provider});
 assert.equal(runs,1);assert.equal(result.energy_low_score[0],2);assert.deepEqual(bytes(planes),original);
});
