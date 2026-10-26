import test from 'node:test';
import assert from 'node:assert/strict';
import {createOriginalSourceRegionsState,compileOriginalSourceRegions} from '../src/source-region-geometry.js';
import {prepareCloneAnalysisWindows} from '../src/clone-analysis-windows.js';
import {localizeSourceRegionTask} from '../src/source-region-localize.js';
import {prepareNeuralStrictSourceContext} from '../src/neural-strict-source-context.js';

const rectangle=b=>[[b[0],b[1]],[b[2],b[1]],[b[2],b[3]],[b[0],b[3]]];
const size={sourceSha256:'a'.repeat(64),width:160,height:96};
const A=[8,8,64,80],B=[88,16,152,88],E=[8,8,152,88],hole=[24,32,32,40];
const zone=(id,b,kind='acquisition')=>({id,kind,enabled:true,x0:b[0],y0:b[1],x1:b[2],y1:b[3],polygon:rectangle(b)});
function budget(){let live=0;return {reserve(n){assert.ok(Number.isSafeInteger(n)&&n>=0);live+=n;let held=true;return()=>{if(held){held=false;live-=n;}};},get live(){return live;}};}
async function domain(zones=[zone('A',A),zone('B',B)]){const s=await createOriginalSourceRegionsState(size);await s.replaceZones(zones,{positiveMode:'selected',enabled:true});return compileOriginalSourceRegions(s.snapshot());}
const task=extra=>({operation:'tampering.copyMove.sparse',params:{algorithm:'ORB'},...extra});

test('Default keeps each acquisition autonomous and never invents an envelope',async()=>{
 const b=budget(),p=await prepareCloneAnalysisWindows({domain:await domain(),task:task()},{budget:b});
 assert.equal(p.mode,'independent');assert.equal(p.global,null);assert.deepEqual(p.windows.map(w=>[w.id,w.kind,w.bounds]),[['A','region',A],['B','region',B]]);
 assert.equal(p.windows[0].contextDomain.containsOriginal(100,30),false);assert.equal(p.windows[1].contextDomain.containsOriginal(20,20),false);
 assert.equal(p.windows[0].contextDomain.countIncluded,56*72);assert.equal(p.windows[1].contextDomain.countIncluded,64*72);
 assert.ok(b.live>0);p.release();p.release();assert.equal(b.live,0);
});
test('Explicit tool envelope stays separate and cannot reopen the Original gap',async()=>{
 const b=budget(),t={operation:'ai.clones.segmentation',cloneWindowMode:'independent',params:{variant:'mgcfdn',selectionPresent:true},regions:[{id:'A',kind:'region',bounds:A},{id:'B',kind:'region',bounds:B},{id:'E',kind:'envelope',bounds:E}]};
 const p=await prepareCloneAnalysisWindows({domain:await domain(),task:t},{budget:b});
 assert.deepEqual(p.windows.map(w=>w.id),['A','B','E']);assert.equal(p.windows[2].kind,'envelope');assert.equal(p.windows[2].contextDomain.containsOriginal(75,35),false);assert.equal(p.windows[2].candidateDomain.containsOriginal(75,35),false);
 assert.equal(p.windows[0].contextDomain.containsOriginal(100,30),false);p.release();assert.equal(b.live,0);
});
test('Overlapping acquisitions and a larger human acquisition retain independent identities',async()=>{
 const b=budget(),overlap=[32,24,112,88],p=await prepareCloneAnalysisWindows({domain:await domain([zone('A',A),zone('overlap',overlap),zone('large',E)]),task:task()},{budget:b});
 assert.deepEqual(p.windows.map(w=>w.id),['A','overlap','large']);assert.equal(p.windows[0].contextDomain.containsOriginal(40,40),true);assert.equal(p.windows[1].contextDomain.containsOriginal(40,40),true);assert.equal(p.windows[2].contextDomain.containsOriginal(40,40),true);
 p.release();assert.equal(b.live,0);
});
test('True exclusions are removed inside each window without creating extra windows',async()=>{
 const b=budget(),p=await prepareCloneAnalysisWindows({domain:await domain([zone('A',A),zone('B',B),zone('hole',hole,'exclusion')]),task:task()},{budget:b});
 assert.equal(p.windows.length,2);assert.equal(p.windows[0].contextDomain.containsOriginal(25,33),false);assert.equal(p.windows[0].contextDomain.countIncluded,56*72-64);assert.equal(p.windows[1].contextDomain.countIncluded,64*72);p.release();assert.equal(b.live,0);
});
test('Changing another disjoint window does not enlarge the first RGB input',async()=>{
 const b=budget(),p=await prepareCloneAnalysisWindows({domain:await domain(),task:task()},{budget:b}),q=await prepareCloneAnalysisWindows({domain:await domain([zone('A',A),zone('B',[100,40,152,88])]),task:task()},{budget:b});
 assert.deepEqual(p.windows[0].bounds,q.windows[0].bounds);for(let y=0;y<size.height;y++)assert.deepEqual(p.windows[0].contextDomain.originalRowIntervals(y),q.windows[0].contextDomain.originalRowIntervals(y));p.release();q.release();assert.equal(b.live,0);
});
test('Global is explicit, excludes undeclared RGB gaps, and changes identities',async()=>{
 const d=await domain(),b=budget(),p=await prepareCloneAnalysisWindows({domain:d,task:task()},{budget:b}),q=await prepareCloneAnalysisWindows({domain:d,task:task({cloneWindowMode:'global'})},{budget:b});
 assert.equal(q.mode,'global');assert.ok(q.global);assert.equal(q.global.contextDomain.containsOriginal(75,35),false);assert.equal(q.global.contextPolicy,'declared-window-context-union');assert.notEqual(q.fingerprint,p.fingerprint);assert.notEqual(q.windows[0].fingerprint,p.windows[0].fingerprint);p.release();q.release();assert.equal(b.live,0);
});
test('Automatic selection honors disabled subwindows and its explicit envelope',async()=>{
 const b=budget(),p=await prepareCloneAnalysisWindows({domain:await domain(),task:{operation:'analysis.clones',params:{selection:{regions:[rectangle(A),rectangle(B)],disabled:[1],envelope:rectangle(E)}}}},{budget:b});
 assert.deepEqual(p.windows.map(w=>w.id),['selection-window-0','selection-envelope']);assert.equal(p.windows[1].kind,'envelope');p.release();assert.equal(b.live,0);
});
test('Explicit empty native selection never falls back to whole image',async()=>{
 const b=budget();await assert.rejects(prepareCloneAnalysisWindows({domain:await domain(),task:{operation:'ai.clones.segmentation',params:{variant:'mgcfdn',selectionPresent:true},regions:[]}},{budget:b}),{code:'SOURCE_SCOPE_EMPTY'});assert.equal(b.live,0);
});
test('Mode validation precedes any preparation or reservation',async()=>{
 const b=budget();await assert.rejects(prepareCloneAnalysisWindows({domain:await domain(),task:task({cloneWindowMode:'together'})},{budget:b}),/window mode/);assert.equal(b.live,0);
});
test('Cancellation and malformed geometry release every metadata owner',async()=>{
 const b=budget(),c=new AbortController();c.abort('stop');await assert.rejects(prepareCloneAnalysisWindows({domain:await domain(),task:task()},{budget:b,signal:c.signal}));assert.equal(b.live,0);
 await assert.rejects(prepareCloneAnalysisWindows({domain:await domain(),task:{operation:'ai.clones.segmentation',params:{variant:'mgcfdn'},regions:[{id:'bad',bounds:[0,0,0,10]}]}},{budget:b}));assert.equal(b.live,0);
});
test('Already localized native windows return to their exact Original positions once',async()=>{
 const d=await domain([zone('A',A),zone('B',B),zone('hole',hole,'exclusion')]),b=budget();
 const original={operation:'ai.clones.segmentation',params:{variant:'mgcfdn',selectionPresent:true},regions:[{id:'A',kind:'region',bounds:A},{id:'B',kind:'region',bounds:B},{id:'E',kind:'envelope',bounds:E}]};
 const localized=await localizeSourceRegionTask(original,d,{strictNeuralFragments:true});
 assert.deepEqual(localized.regions[0].bounds,[0,0,56,72]);
 const p=await prepareCloneAnalysisWindows({domain:d,task:localized},{budget:b});assert.deepEqual(p.windows.map(w=>w.bounds),[A,B,E]);assert.equal(p.windows[0].contextDomain.containsOriginal(25,33),false);p.release();assert.equal(b.live,0);
});
test('Equal and overlapping geometry does not erase distinct windows',async()=>{
 const b=budget(),p=await prepareCloneAnalysisWindows({domain:await domain([zone('A',A),zone('same-pixels',A)]),task:task()},{budget:b});assert.equal(p.windows.length,2);assert.notEqual(p.windows[0].fingerprint,p.windows[1].fingerprint);p.release();assert.equal(b.live,0);
});
test('Window preparation preserves backend and every native scientific parameter',async()=>{
 const b=budget(),params={algorithm:'ALIKED + LightGlue',threshold:.37,limit:6000,reflections:false,model:'Affine',geometricThreshold:3,geometricMinimum:24};
 for(const backend of ['auto','webgpu','cpu'])for(const mode of ['independent','global']){const input=task({params,backend,cloneWindowMode:mode}),p=await prepareCloneAnalysisWindows({domain:await domain(),task:input},{budget:b});assert.equal(p.originalTask.backend,backend);assert.deepEqual(p.originalTask.params,params);assert.deepEqual(input.params,params);p.release();}assert.equal(b.live,0);
});
test('Malformed explicit window list cannot become an implicit whole-image analysis',async()=>{
 const b=budget();await assert.rejects(prepareCloneAnalysisWindows({domain:await domain(),task:{operation:'ai.clones.segmentation',params:{variant:'mgcfdn'},regions:{length:0}}},{budget:b}));assert.equal(b.live,0);
});
test('A reserved negative ID cannot collide with a human window ID',async()=>{
 const b=budget(),p=await prepareCloneAnalysisWindows({domain:await domain([zone('clone-negative-0',A),zone('hole',hole,'exclusion')]),task:task()},{budget:b});assert.equal(p.windows[0].id,'clone-negative-0');assert.equal(p.windows[0].contextDomain.containsOriginal(25,33),false);p.release();assert.equal(b.live,0);
});
test('An empty window stays explicitly empty, without borrowing a neighboring window',async()=>{
 const b=budget(),p=await prepareCloneAnalysisWindows({domain:await domain(),task:{operation:'ai.clones.segmentation',params:{variant:'mgcfdn'},regions:[{id:'off-selection',bounds:[68,8,80,24]},{id:'A',bounds:A}]}},{budget:b});assert.equal(p.windows[0].status,'empty');assert.equal(p.windows[0].candidateDomain.countIncluded,0);assert.equal(p.windows[1].status,'ready');p.release();assert.equal(b.live,0);
});
test('A single window outside every admitted acquisition produces an empty plan with no fallback',async()=>{
 const b=budget(),p=await prepareCloneAnalysisWindows({domain:await domain(),task:{operation:'ai.clones.segmentation',params:{variant:'mgcfdn'},regions:[{id:'off-selection',bounds:[68,8,80,24]}]}},{budget:b});assert.equal(p.windows.length,1);assert.equal(p.windows[0].status,'empty');assert.equal(p.windows[0].candidateDomain.countIncluded,0);assert.deepEqual(p.windows[0].bounds,[68,8,80,24]);p.release();assert.equal(b.live,0);
});
test('A single wholly excluded window remains empty in both independent and global plans',async()=>{
 for(const mode of ['independent','global']){const b=budget(),p=await prepareCloneAnalysisWindows({domain:await domain([zone('A',A),zone('B',B),zone('exclude-A',A,'exclusion')]),task:{operation:'ai.clones.segmentation',cloneWindowMode:mode,params:{variant:'mgcfdn'},regions:[{id:'A',bounds:A}]}},{budget:b});assert.equal(p.windows.length,1);assert.equal(p.windows[0].status,'empty');assert.equal(p.windows[0].contextDomain.countIncluded,0);if(mode==='global')assert.equal(p.global.candidateDomain.countIncluded,0);p.release();assert.equal(b.live,0);}
});
test('Legacy strict consumers retain their original empty-candidate rejection by default',async()=>{
 const b=budget(),d=await domain(),task={operation:'ai.clones.segmentation',params:{variant:'mgcfdn'},regions:[{id:'off-selection',bounds:[68,8,80,24]}]};await assert.rejects(prepareNeuralStrictSourceContext({domain:d,task},{budget:b}),{code:'SOURCE_SCOPE_EMPTY'});assert.equal(b.live,0);
});

test('Native scientific envelope:true retains its window identity within the Original ceiling',async()=>{const b=budget(),d=await domain(),t=task({params:{algorithm:'ORB',scientificScope:{schema:'sherloq.scientific-scope/1',coordinates:'original-pixels',...size,status:'ready',fingerprint:'native-envelope',regions:[{id:'a',x0:8,y0:8,x1:64,y1:80},{id:'b',x0:88,y0:16,x1:152,y1:88}],searchRegions:[{id:'e',envelope:true,x0:8,y0:8,x1:152,y1:88}],excluded:[]}}});let answer;try{answer=await prepareCloneAnalysisWindows({domain:d,task:t},{budget:b});assert.equal(answer.windows.length,1);assert.equal(answer.windows[0].kind,'envelope');assert.deepEqual(answer.windows[0].bounds,E);assert.equal(answer.windows[0].contextDomain.containsOriginal(75,35),false);}finally{answer?.release();}assert.equal(b.live,0);});
