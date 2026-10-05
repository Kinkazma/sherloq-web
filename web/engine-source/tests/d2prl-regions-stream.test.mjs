import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';
import {Budget} from '../src/cache.js';import {streamedD2prlRegions} from '../src/d2prl-regions-stream.js';import {createCloneEntryGeometry} from '../src/clone-entry-geometry.js';
const reference=JSON.parse(await readFile(new URL('./data/clone-entries-native.json',import.meta.url))),store=data=>({byteLength:data.length,readInto(out,at){out.set(data.subarray(at,at+out.length));}}),flattened=e=>({...e,pixel_mask:Array.from({length:e.pixel_mask.height},(_,y)=>[...e.pixel_mask.data.subarray(y*e.pixel_mask.width,(y+1)*e.pixel_mask.width)])});
test('paged D2 regions preserve complete native masks, contours, order, counts and identities',async()=>{
 for(const c of reference.masks){const budget=new Budget(256*1024**2),mask=Uint8Array.from(c.mask.flat()),result=await streamedD2prlRegions({...c,mask:store(mask),boxes:c.metadata?.boxes??[],minimum:c.metadata?.min_component??500},{budget});try{assert.deepEqual(result.entries.map(flattened),c.expected,c.name);}finally{result.release();}assert.equal(budget.total(),0);}
});
test('global run traversal agrees with native block CCL for random8-connected topology',async()=>{
 const budget=new Budget(256*1024**2),width=47,height=39,g=await createCloneEntryGeometry({budget,maxPixels:width*height});let state=1773;
 try{for(let trial=0;trial<32;trial++){const mask=Uint8Array.from({length:width*height},()=>{state=(Math.imul(state,1664525)+1013904223)>>>0;return (state>>>16)%100<10+trial*2?1:0;}),native=await g.regions({width,height,mask}),paged=await streamedD2prlRegions({width,height,mask:store(mask)},{budget});try{assert.deepEqual(paged.entries,native.entries,'trial '+trial);}finally{native.release();paged.release();}}}finally{g.dispose();}assert.equal(budget.total(),0);
});
test('paged region abort, storage failure and consumer exceptions release scratch and entry leases',async()=>{
 const width=80,height=70,mask=store(new Uint8Array(width*height).fill(1)),budget=new Budget(2*1024**2);
 for(const mode of ['abort','consumer','read']){const controller=new AbortController(),input=mode==='read'?{...mask,readInto(){throw Error('read');}}:mask;await assert.rejects(streamedD2prlRegions({width,height,mask:input},{budget,signal:controller.signal,onProgress(){if(mode==='abort')controller.abort();else throw Error('consumer');}}),mode==='abort'?{code:'CANCELLED'}:new RegExp(mode));assert.equal(budget.total(),0);}
});
test('automatic segmented refilter waits for borrowed result release and leaves independent entries',async()=>{
 const {d2prlEntries}=await import('../src/automatic-ai-entries.js'),budget=new Budget(8*1024**2),width=40,height=30,mask=new Uint8Array(width*height).fill(1),input={width,height,layout:'segmented',stores:{mask:store(mask)},metadata:{min_component:500,boxes:[[0,0,width,height]]}};let released=false;
 const result=await d2prlEntries(input,{budget,minimum:17,async refilter(){return {...input,metadata:{...input.metadata,min_component:17},async release(){await new Promise(resolve=>setTimeout(resolve,5));mask.fill(0);released=true;}};}});
 assert.ok(released);assert.equal(result.entries[0].count,width*height);assert.ok(result.entries[0].pixel_mask.data.every(n=>n===1));result.release();assert.equal(budget.total(),0);
 await assert.rejects(d2prlEntries(input,{budget,minimum:17,async refilter(){return {...input,stores:{mask:store(new Uint8Array(width*height).fill(1))},metadata:{...input.metadata,min_component:17},async release(){throw Error('asynchronous projection cleanup');}};}}),/asynchronous projection cleanup/);assert.equal(budget.total(),0);
});
