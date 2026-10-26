import test from 'node:test';
import assert from 'node:assert/strict';
import {Budget} from '../src/cache.js';
import {createOriginalSourceRegionsState,compileOriginalSourceRegions} from '../src/source-region-geometry.js';
import {createSourceRegionView} from '../src/source-region-view.js';
import {prepareSelfDMWindowContexts} from '../src/selfdm-window-context-plan.js';
import {prepareSelfDMProposalGrayOwners} from '../src/selfdm-proposal-gray-owners.js';
async function setup(boxes){const budget=new Budget(32*1024**2),hash='d'.repeat(64),width=16,height=12,state=await createOriginalSourceRegionsState({sourceSha256:hash,width,height});await state.replaceZones(boxes.map((b,i)=>({id:'r'+i,kind:'acquisition',enabled:true,x0:b[0],y0:b[1],x1:b[2],y1:b[3]})),{enabled:true,positiveMode:'selected'});const domain=await compileOriginalSourceRegions(state.snapshot());let reads=0,forbidden=0;const source={sha256:hash,width,height,async readWindow(r){const free=budget.reserve(r.width*r.height*3),data=new Uint8Array(r.width*r.height*3);for(let y=0;y<r.height;y++)for(let x=0;x<r.width;x++){if(!domain.containsOriginal(r.x+x,r.y+y)){forbidden++;throw Error('Forbidden')}reads++;data.fill(((r.y+y)*16+r.x+x)&255,(y*r.width+x)*3,(y*r.width+x+1)*3)}return{pixels:{format:'rgb8',width:r.width,height:r.height,data},release:free}}},view=await createSourceRegionView(source,domain.descriptor,{budget,maxReadPixels:1024});return{budget,domain,view,source,state:()=>({reads,forbidden})}}
test('a contiguous ROI coalesces an old Map technical cut and has the exact same native RGB input as the coalesced union',async()=>{
 const H=[[0,0,16,6],[0,6,8,12]],V=[[0,0,8,12],[8,0,16,6]];let expected;
 for(const boxes of[H,V,[...V].reverse().concat([[0,0,5,12],[0,0,16,4]]),[[0,0,8,12]]]){
  const s=await setup(boxes),map=await prepareSelfDMWindowContexts({original:{sha256:s.domain.sourceSha256,width:16,height:12,surface:s.source},window:{id:'map',kind:'region',bounds:[0,0,16,12],fingerprint:'test-population',contextDomain:s.domain.descriptor,candidateDomain:s.domain.descriptor}},{budget:s.budget}),p=await prepareSelfDMProposalGrayOwners(s.view,[0,0,8,12],[320,240],{budget:s.budget});
  try{assert.equal(s.state().reads,0);if(boxes!==undefined&&boxes.length>1){const naive=map.contexts.map(c=>c.bounds).map(([x,y,r,b])=>[Math.max(x,0),Math.max(y,0),Math.min(r,8),Math.min(b,12)]).filter(([x,y,r,b])=>r>x&&b>y);assert.equal(naive.length,2)}assert.equal(p.owners.length,1);assert.equal(p.owners[0].fullProposal,true);assert.deepEqual(p.owners[0].bounds,[0,0,8,12]);assert.deepEqual(p.owners[0].size,[320,240]);const row=await p.owners[0].readRows(0,12);try{if(!expected)expected=row.pixels.data.slice();else assert.deepEqual(row.pixels.data,expected)}finally{await row.release()}assert.equal(s.state().reads,96);assert.equal(s.state().forbidden,0)}finally{await p.release();await map.release();await s.view.dispose()}assert.equal(s.budget.total(),0);
 }
});
test('a true absent ROI strip remains separate literal owners rather than a filled gray rectangle',async()=>{
 const s=await setup([[0,0,6,12],[10,0,16,12]]),p=await prepareSelfDMProposalGrayOwners(s.view,[0,0,16,12],[320,240],{budget:s.budget});try{assert.equal(p.owners.length,2);assert.deepEqual(p.owners.map(o=>o.bounds),[[0,0,6,12],[10,0,16,12]]);for(const o of p.owners){const row=await o.readRows(0,12);await row.release()}assert.equal(s.state().reads,144);assert.equal(s.state().forbidden,0)}finally{await p.release();await s.view.dispose()}assert.equal(s.budget.total(),0);
});
test('ROI metadata retirement rejects new reads and preserves the borrowed SourceView',async()=>{
 const s=await setup([[0,0,16,12]]),p=await prepareSelfDMProposalGrayOwners(s.view,[2,2,10,10],[320,240],{budget:s.budget});const row=await p.owners[0].readRows(0,1);assert.equal(p.state().sourceRows,1);await p.release();assert.equal(p.state().closed,true);assert.equal(p.state().sourceRows,0);await row.release();await assert.rejects(p.owners[0].readRows(0,1),/retired/);const still=await s.view.readWindow({x:0,y:0,width:1,height:1});await still.release();await s.view.dispose();assert.equal(s.budget.total(),0);
});
