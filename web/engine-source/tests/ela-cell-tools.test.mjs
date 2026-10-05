import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';
import {coherentCellScores,segmentElaCells,aggregateGhostCells} from '../src/ela-cell-tools.js';
const ref=JSON.parse(await readFile(new URL('./data/ela-cell-native.json',import.meta.url)));
function input({seed,rows,cols,mode}){
 let state=seed;const rand=()=>state=(Math.imul(state,1664525)+1013904223)>>>0,n=rows*cols;
 const signed_scores=Float32Array.from({length:n*15},()=>((rand()%65)-32)/8),supported=Uint8Array.from({length:n},()=>Number(rand()%5>0)),score=Float32Array.from({length:n},()=>rand()%11/2),legacy_score=Float32Array.from({length:n},()=>rand()%7/2),ghost_score=Float32Array.from({length:n},()=>rand()%9/2),background_score=Float32Array.from({length:n},()=>rand()%10/2),ghost_supported=Uint8Array.from({length:n},()=>Number(rand()%4>0)),background_supported=Uint8Array.from({length:n},()=>Number(rand()%3>0));
 return {rows,cols,signed_scores,supported,score,metadata:{block:32},...(mode>=1?{legacy_score}:{}),...(mode>=2?{ghost_score,ghost_supported,ela_score:legacy_score}:{}),...(mode>=3?{background_score,background_supported}:{})};
}
test('ELA quality/spatial coherence and seeded legacy/Ghost/background segmentation match native',async()=>{
 for(const item of ref.cases){const base=input(item),coherent=await coherentCellScores(base);assert.deepEqual([...coherent],item.coherent.flat(),'coherence '+item.seed);
 for(const expected of item.expected){const r=await segmentElaCells(base,expected);assert.equal(r.labels.reduce((n,v,i)=>n+Number(v!==expected.labels.flat()[i]),0),0,'labels '+item.seed+'/'+expected.threshold);assert.deepEqual(r.regions,expected.regions,'regions '+item.seed+'/'+expected.threshold);}}
});
test('Ghost area integration exactly registers fractional phases and invalid incomplete cells',async()=>{
 for(const item of ref.aggregations){const maps=Float64Array.from({length:item.mapRows*item.mapCols*item.qualities},(_,i)=>(i%103)*.001),r=await aggregateGhostCells({maps,rows:item.mapRows,cols:item.mapCols,qualities:item.qualities},item);assert.deepEqual([...r.valid],item.valid.flat().map(Number));const expected=item.curves.flat(2);assert.equal(r.curves.reduce((n,v,i)=>n+Number(v!==expected[i]),0),0,'binary64 curves '+JSON.stringify([item.block,item.dx,item.dy]));}
});
test('coherence cannot seed a new region; only retained legacy/Ghost/background components can',async()=>{
 const rows=5,cols=5,n=25,base={rows,cols,score:new Float32Array(n).fill(4),legacy_score:new Float32Array(n),supported:new Uint8Array(n).fill(1),signed_scores:new Float32Array(n*15),metadata:{block:16}};
 assert.equal((await segmentElaCells(base)).regions.length,0);
 base.ghost_score=new Float32Array(n);base.ghost_score.set([3,3,3]);base.ghost_supported=new Uint8Array(n).fill(1);const r=await segmentElaCells(base);assert.equal(r.regions.length,1);assert.equal(r.regions[0].cells,25);
 base.supported.fill(0);assert.equal((await segmentElaCells(base)).regions.length,0);
});
test('cell preparation validates inputs and responds to cancellation',async()=>{
 const base=input(ref.cases[0]),abort=new AbortController();abort.abort();await assert.rejects(coherentCellScores(base,{signal:abort.signal}),{code:'CANCELLED'});await assert.rejects(segmentElaCells(base,{threshold:0}),{code:'INVALID_INPUT'});base.score[0]=NaN;await assert.rejects(segmentElaCells(base),{code:'INVALID_INPUT'});
});
