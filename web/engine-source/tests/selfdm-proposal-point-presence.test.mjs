import test from 'node:test';
import assert from 'node:assert/strict';
import {Budget} from '../src/cache.js';
import {createOriginalSourceRegionsState,compileOriginalSourceRegions} from '../src/source-region-geometry.js';
import {createSourceRegionView} from '../src/source-region-view.js';
import {prepareSelfDMProposalGrayOwners} from '../src/selfdm-proposal-gray-owners.js';
import {prepareSelfDMProposalPointPresence} from '../src/selfdm-proposal-point-presence.js';
import {createSelfDMScientificScopeInput} from '../src/selfdm-scientific-scope.js';
import {createProposalPointAdmission,restrictProposalDenseScores} from '../src/selfdm-proposal-scope.js';
const sha='b'.repeat(64),width=80,height=64;
async function domain(boxes,excluded=[],sourceSha256=sha){const s=await createOriginalSourceRegionsState({sourceSha256,width,height});await s.replaceZones([...boxes.map((b,i)=>({id:'a'+i,kind:'acquisition',enabled:true,x0:b[0],y0:b[1],x1:b[2],y1:b[3]})),...excluded.map((b,i)=>({id:'n'+i,kind:'exclusion',enabled:true,x0:b[0],y0:b[1],x1:b[2],y1:b[3]}))],{enabled:true,positiveMode:'selected'});return compileOriginalSourceRegions(s.snapshot())}
async function setup(boxes=[[0,0,width,height]],bounds=[13,7,61,43],size=[64,56]){const budget=new Budget(32*1024**2),context=await domain(boxes);let reads=0;const source={sha256:sha,width,height,readWindow(){reads++;throw Error('Point presence must never read RGB')}},view=await createSourceRegionView(source,context.descriptor,{budget,maxReadPixels:10000}),gray=await prepareSelfDMProposalGrayOwners(view,bounds,size,{budget});return{budget,context,gray,view,reads:()=>reads,async release(){await gray.release();await view.dispose();assert.equal(budget.total(),0)}}}
test('a fully candidate literal owner retains every native score position including borders, without RGB or added support erosion',async()=>{
 const s=await setup();try{const p=await prepareSelfDMProposalPointPresence({grayOwners:s.gray,grayOwner:s.gray.owners[0],contextDomain:s.context,candidateDomain:s.context},{budget:s.budget});assert.equal(p.presence.length,64*56);assert.ok(p.presence.every(v=>v===1));assert.equal(p.metadata.fullCandidateOwner,true);assert.equal(p.metadata.nativePaddingPreserved,true);assert.equal(p.metadata.admitted,64*56);assert.equal(s.reads(),0);await p.release()}finally{await s.release()}
});
test('partial candidate with nonzero Original origin reproduces the historical gray/descriptor support exactly',async()=>{
 const s=await setup(),candidate=await domain([[13,7,37,43]]);let legacy,admission,p;
 try{
  p=await prepareSelfDMProposalPointPresence({grayOwners:s.gray,grayOwner:s.gray.owners[0],contextDomain:s.context,candidateDomain:candidate},{budget:s.budget});
  legacy=await createSelfDMScientificScopeInput({scope:{schema:'sherloq.scientific-scope/1',coordinates:'original-pixels',sourceSha256:sha,width,height,fingerprint:'native-legacy-half-owner',status:'ready',regions:[{x0:13,y0:7,x1:36,y1:42}],excluded:[]},sourceSha256:sha,width,height,bounds:[0,0,width,height]},{budget:s.budget});
  admission=await createProposalPointAdmission(legacy,[13,7,61,43],64,56,{budget:s.budget});const expected=new Float32Array(64*56).fill(1);await restrictProposalDenseScores(expected,{scope:legacy,admission,rect:[13,7,61,43],width:64,height:56,denseWidth:64,denseHeight:56});assert.deepEqual(p.presence,Uint8Array.from(expected));assert.ok(p.metadata.admitted>0&&p.metadata.excluded>0);assert.equal(p.metadata.descriptorSupport.nativeStride,8);assert.equal(s.reads(),0);
 }finally{await p?.release();await admission?.release();await legacy?.release();await s.release()}
});
test('a real candidate hole is absent in identified support before NMS without reading RGB',async()=>{
 const s=await setup(),candidate=await domain([[0,0,width,height]],[[31,15,39,35]]);try{const p=await prepareSelfDMProposalPointPresence({grayOwners:s.gray,grayOwner:s.gray.owners[0],contextDomain:s.context,candidateDomain:candidate},{budget:s.budget});assert.ok(p.metadata.admitted>0&&p.metadata.excluded>0);assert.equal(p.presence[28*64+28],0);assert.equal(s.reads(),0);assert.match(p.identity,new RegExp(candidate.fingerprint));await p.release()}finally{await s.release()}
});
test('same ROI from contiguous technical partitions, reverse order and overlaps has exactly one owner and identical candidate presence',async()=>{
 const H=[[0,0,80,32],[0,32,40,64]],V=[[0,0,40,64],[40,0,80,32]],candidate=await domain([[0,0,20,64]]);let expected;
 for(const boxes of[H,V,[...V].reverse().concat([[0,0,19,64],[0,0,80,20]])]){const s=await setup(boxes,[0,0,40,64],[64,56]);try{assert.equal(s.gray.owners.length,1);const p=await prepareSelfDMProposalPointPresence({grayOwners:s.gray,grayOwner:s.gray.owners[0],contextDomain:s.context,candidateDomain:candidate},{budget:s.budget});if(expected)assert.deepEqual(p.presence,expected);else expected=p.presence.slice();assert.equal(s.reads(),0);await p.release()}finally{await s.release()}}
});
test('wrong Original SHA, noncanonical owner and cancellation refuse without RGB and retain no allocation',async()=>{
 const s=await setup(),wrong=await domain([[0,0,width,height]],[],'c'.repeat(64));try{
  await assert.rejects(prepareSelfDMProposalPointPresence({grayOwners:s.gray,grayOwner:s.gray.owners[0],contextDomain:s.context,candidateDomain:wrong},{budget:s.budget}),{code:'INVALID_INPUT'});
  await assert.rejects(prepareSelfDMProposalPointPresence({grayOwners:s.gray,grayOwner:{...s.gray.owners[0]},contextDomain:s.context,candidateDomain:s.context},{budget:s.budget}),{code:'INVALID_INPUT'});
  const controller=new AbortController();controller.abort();await assert.rejects(prepareSelfDMProposalPointPresence({grayOwners:s.gray,grayOwner:s.gray.owners[0],contextDomain:s.context,candidateDomain:s.context},{budget:s.budget,signal:controller.signal}),{code:'CANCELLED'});assert.equal(s.reads(),0);
 }finally{await s.release()}
});
