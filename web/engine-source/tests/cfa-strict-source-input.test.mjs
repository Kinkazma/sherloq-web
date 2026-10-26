import {test} from 'node:test';
import assert from 'node:assert/strict';
import {cfaFixture} from './helpers/cfa-strict-fixture.mjs';
import {serveNativeSourceChannel} from '../src/native-source-channel.js';
import {receiveCfaStrictSourceInput} from '../src/cfa-strict-source-input.js';
import {assertM2SourceRegionTask} from '../src/m2-source-region-input.js';
const setup=async(f,patch={})=>{
 const channel=new MessageChannel(),d=f.domain,reader={width:d.width,height:d.height,readWindow:(rect,hooks)=>f.image.surface.readWindow({...rect,x:rect.x+d.origin[0],y:rect.y+d.origin[1]},hooks)},provider=serveNativeSourceChannel(channel.port1,reader);
 const input={format:'rgb8-window-source',sha256:d.sourceSha256,width:d.width,height:d.height,origin:[...d.origin],sourceRegionDomain:d.descriptor,purpose:'analysis-native-contexts',analysisContext:'native-cfa-contexts-only',port:channel.port2,...patch};
 return{input,provider,async close(){await provider.dispose();channel.port2.close();}};
};

test('real MessageChannel rejects holes before transfer to analysis and exposes a separate presentation reader',async()=>{
 const f=await cfaFixture({rectangles:[[3,5,99,85]],exclusions:[[35,29,43,53]],poison:191}),t=await setup(f);let image,r,frame;
 try{image=await receiveCfaStrictSourceInput(t.input,{budget:f.budget});await assert.rejects(async()=>image.surface.readWindow({x:3,y:5,width:96,height:80}),{code:'SOURCE_REGION_PARTIAL_WINDOW'});assert.equal(f.windows.size,0);
  r=await f.api.analyze(image,{block:8,tile:32},{sourceRegionDomain:f.domain.descriptor});assert(r.data.cellCount>0);frame=await f.api.render(image,r,1);for(let y=24;y<48;y++)for(let x=32;x<40;x++)assert.equal(frame.data[(y*96+x)*3],191);assert.equal(f.windows.size,0);
 }finally{frame?.release();r?.release();image?.dispose();await t.close();await f.close();assert.equal(f.budget.snapshot().activeReservationBytes,0);}
});
test('transport identity, origin, native dimensions and explicit consumer purpose are revalidated before RGB',async()=>{
 const f=await cfaFixture({rectangles:[[3,5,99,85]]});try{for(const patch of[{purpose:'preparation-envelope'},{origin:[0,0]},{origin:[3,5,9]},{sha256:'b'.repeat(64)},{width:95},{preparationContext:'envelope-not-scientific-membership'}]){const t=await setup(f,patch);try{await assert.rejects(receiveCfaStrictSourceInput(t.input,{budget:f.budget}),{code:'INVALID_INPUT'});assert.equal(f.windows.size,0);assert.equal(f.budget.snapshot().activeReservationBytes,0);}finally{await t.close();}}}finally{await f.close();}
});
test('closing a real channel during its analysis read cancels and retires receive leases',async()=>{
 const abort=new AbortController(),f=await cfaFixture(),t=await setup(f);let image;
 try{image=await receiveCfaStrictSourceInput(t.input,{budget:f.budget,signal:abort.signal});abort.abort();await assert.rejects(async()=>image.surface.readWindow({x:0,y:0,width:16,height:16}),{code:'CANCELLED'});}finally{image?.dispose();await t.close();await f.close();assert.equal(f.budget.snapshot().activeReservationBytes,0);}
});
test('independent tool-coordinate exclusions cannot be silently ignored by the new manager',async()=>{
 const f=await cfaFixture();try{for(const params of[{excluded:[[[0,0],[8,0],[8,8],[0,8]]]},{scientificScope:{fingerprint:'unbound'}},{regions:[[[0,0],[32,0],[32,32],[0,32]]]}]){await assert.rejects(f.run({...params,block:8}),{code:'SOURCE_COORDINATES_UNLOCALIZED'});assert.equal(f.calls.length,0);assert.equal(f.budget.snapshot().activeReservationBytes,0);}}finally{await f.close();}
});
