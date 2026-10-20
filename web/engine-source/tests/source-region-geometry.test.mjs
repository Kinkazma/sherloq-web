import test from 'node:test';
import assert from 'node:assert/strict';
import {createOriginalSourceRegionsState,compileOriginalSourceRegions,validateOriginalSourceRegions} from '../src/source-region-geometry.js';
const source={sourceSha256:'a'.repeat(64),width:12,height:10};
const rect=(x0,y0,x1,y1)=>({x0,y0,x1,y1});
const zone=(id,kind,r,enabled=true)=>({id,kind,enabled,...r});

test('initial disabled scope keeps the exact full source and a frozen portable snapshot',async()=>{
 const state=await createOriginalSourceRegionsState(source),value=state.snapshot(),domain=await compileOriginalSourceRegions(value);
 assert.equal(value.enabled,false);assert.equal(value.positiveMode,'whole');assert.equal(domain.countIncluded,120);assert.deepEqual(domain.rect,rect(0,0,12,10));
 assert.ok(Object.isFrozen(value)&&Object.isFrozen(value.zones));assert.deepEqual(structuredClone(value),value);assert.throws(()=>value.enabled=true,TypeError);
});

test('overlapping positives are counted once and exclusions win over both at every intersection',async()=>{
 const state=await createOriginalSourceRegionsState(source);await state.replaceZones([zone('a','acquisition',rect(1,2,8,8)),zone('b','acquisition',rect(5,4,11,9)),zone('x','exclusion',rect(6,3,9,7))]);
 const domain=await compileOriginalSourceRegions(state.snapshot());assert.equal(domain.countIncluded,49);assert.deepEqual(domain.rect,rect(1,2,11,9));assert.deepEqual(domain.origin,[1,2]);assert.equal(domain.width,10);assert.equal(domain.height,7);assert.deepEqual(domain.rowIntervals(2),[[0,5],[8,10]]);assert.equal(domain.containsOriginal(6,4),false);assert.equal(domain.containsOriginal(9,4),true);assert.deepEqual(domain.toOriginal(domain.toLocal([9,4])),[9,4]);
});

test('exclusion-only scope uses whole mode while disabling it retains its geometry and original fingerprint',async()=>{
 const state=await createOriginalSourceRegionsState(source);await state.add('exclusion',rect(2,1,5,5),{id:'text'});const active=state.snapshot();assert.equal(active.positiveMode,'whole');assert.equal((await compileOriginalSourceRegions(active)).countIncluded,108);
 await state.toggle(false);assert.equal((await compileOriginalSourceRegions(state.snapshot())).countIncluded,120);assert.deepEqual(state.snapshot().zones,active.zones);
 await state.toggle(true);assert.equal(state.snapshot().fingerprint,active.fingerprint);assert.ok(state.snapshot().revision>active.revision);
});

test('selected scope remains explicitly empty after deleting, clearing or disabling its final positive',async()=>{
 const state=await createOriginalSourceRegionsState(source);await state.add('acquisition',rect(2,2,6,6),{id:'a'});await state.setZoneEnabled('a',false);let domain=await compileOriginalSourceRegions(state.snapshot());assert.equal(domain.empty,true);assert.equal(domain.rect,null);assert.equal(domain.countIncluded,0);
 await state.undo();await state.remove('a');assert.equal(state.snapshot().positiveMode,'selected');assert.equal((await compileOriginalSourceRegions(state.snapshot())).empty,true);await state.undo();await state.clear();assert.equal((await compileOriginalSourceRegions(state.snapshot())).empty,true);await state.undo();assert.equal(state.snapshot().zones[0].id,'a');
});

test('delete, enabled toggle and clear share undo/redo history without losing IDs or geometry',async()=>{
 const state=await createOriginalSourceRegionsState(source);await state.add('acquisition',rect(1,1,5,5),{id:'stable'});const baseline=state.snapshot();await state.toggle(false);await state.remove('stable');await state.clear();
 await state.undo();assert.equal(state.snapshot().enabled,false);assert.equal(state.snapshot().zones[0].id,'stable');await state.undo();assert.equal(state.snapshot().fingerprint,baseline.fingerprint);await state.redo();assert.equal(state.snapshot().enabled,false);await state.redo();assert.equal(state.snapshot().zones.length,0);assert.equal(state.canRedo,false);
});

test('original geometry survives many moves and a double-click-style restore, with undo of that restore',async()=>{
 const state=await createOriginalSourceRegionsState(source);await state.add('acquisition',rect(1,1,4,4),{id:'a'});const original=state.snapshot().zones[0].originalGeometry;
 for(let i=0;i<20;i++)await state.update('a',rect(i%7,i%5,i%7+3,i%5+3),{operation:'move'});
 const moved=state.snapshot();assert.deepEqual(moved.zones[0].originalGeometry,original);await state.restoreGeometry('a');assert.deepEqual(state.snapshot().zones[0].polygon,original.polygon);await state.undo();assert.equal(state.snapshot().fingerprint,moved.fingerprint);
});

test('immutable global ceiling blocks expanded or disabled local regions and local redetection',async()=>{
 const parent=await createOriginalSourceRegionsState(source);await parent.replaceZones([zone('p','acquisition',rect(1,1,11,9)),zone('hole','exclusion',rect(4,0,7,10))]);const ceiling=await compileOriginalSourceRegions(parent.snapshot());assert.equal(ceiling.countIncluded,56);
 const child=await createOriginalSourceRegionsState(source,{snapshot:structuredClone(parent.snapshot())});await child.replaceZones([zone('local','acquisition',rect(0,0,12,10))]);let domain=await compileOriginalSourceRegions(child.snapshot(),{ceiling});assert.equal(domain.countIncluded,56);assert.equal(domain.containsOriginal(5,4),false);assert.equal(domain.containsOriginal(0,0),false);
 await child.toggle(false);domain=await compileOriginalSourceRegions(child.snapshot(),{ceiling});assert.equal(domain.countIncluded,56);assert.equal(parent.snapshot().zones.length,2);assert.equal(parent.snapshot().enabled,true);
});

test('a transported compiled descriptor recreates identical membership and job identity',async()=>{
 const parent=await createOriginalSourceRegionsState(source);await parent.add('exclusion',rect(2,2,5,5),{id:'p'});const child=await createOriginalSourceRegionsState(source);await child.add('acquisition',rect(1,1,8,8),{id:'c'});
 const a=await compileOriginalSourceRegions(child.snapshot(),{ceiling:parent.snapshot()}),transport=structuredClone(a.descriptor),b=await compileOriginalSourceRegions(transport);
 assert.equal(b.fingerprint,a.fingerprint);assert.deepEqual(b.rect,a.rect);assert.equal(b.countIncluded,a.countIncluded);for(let y=0;y<a.height;y++)assert.deepEqual(b.rowIntervals(y),a.rowIntervals(y));assert.equal(typeof transport.rowIntervals,'undefined');
 transport.fingerprint='0'.repeat(64);await assert.rejects(compileOriginalSourceRegions(transport),/identity differs/);
});

test('exclusion edges are closed and pixel membership uses pixel centres',async()=>{
 const state=await createOriginalSourceRegionsState(source);await state.add('exclusion',rect(2.5,0,4.5,10),{id:'e'});const domain=await compileOriginalSourceRegions(state.snapshot());assert.equal(domain.countIncluded,90);assert.equal(domain.containsOriginal(2,5),false);assert.equal(domain.containsOriginal(4,5),false);assert.equal(domain.containsOriginal(5,5),true);assert.equal(domain.containsPointOriginal(2.5,5),false);assert.deepEqual(domain.originalRowIntervals(5),[[0,2],[5,12]]);
});

test('triangle row intervals agree with an independent half-plane oracle at every pixel centre',async()=>{
 const state=await createOriginalSourceRegionsState(source),polygon=[[1,1],[10,1],[1,10]];await state.replaceZones([zone('triangle','acquisition',{...rect(1,1,10,10),polygon})]);const domain=await compileOriginalSourceRegions(state.snapshot());let count=0;
 for(let y=0;y<source.height;y++)for(let x=0;x<source.width;x++){const expected=x+.5>=1&&y+.5>=1&&x+y+1<=11,counted=domain.originalRowIntervals(y).some(([a,b])=>x>=a&&x<b);assert.equal(domain.containsOriginal(x,y),expected);assert.equal(counted,expected);if(expected)count++;}assert.equal(domain.countIncluded,count);
});

test('deterministic overlapping rectangle corpora match a separate pixel-set oracle',async()=>{
 let seed=19;const random=n=>((seed=(seed*1664525+1013904223)>>>0)%n);
 for(let k=0;k<30;k++){const zones=Array.from({length:8},(_,i)=>{const x=random(11),y=random(9);return zone('z'+i,i<5?'acquisition':'exclusion',rect(x,y,x+1+random(12-x),y+1+random(10-y)),i!==3);});const state=await createOriginalSourceRegionsState(source);await state.replaceZones(zones);const domain=await compileOriginalSourceRegions(state.snapshot());let count=0;
  for(let y=0;y<10;y++)for(let x=0;x<12;x++){const hit=z=>x>=z.x0&&x<z.x1&&y>=z.y0&&y<z.y1,expected=zones.some(z=>z.enabled&&z.kind==='acquisition'&&hit(z))&&!zones.some(z=>z.enabled&&z.kind==='exclusion'&&hit(z));assert.equal(domain.containsOriginal(x,y),expected);assert.equal(domain.originalRowIntervals(y).some(([a,b])=>x>=a&&x<b),expected);count+=Number(expected);}assert.equal(domain.countIncluded,count);
 }
});

test('restored snapshots validate identity and fingerprint before mutating current state',async()=>{
 const state=await createOriginalSourceRegionsState(source);await state.add('acquisition',rect(2,2,7,7),{id:'a'});const original=state.snapshot(),changed=structuredClone(original);changed.zones[0].x0=1;changed.zones[0].polygon[0][0]=1;
 await assert.rejects(state.restore(changed));assert.equal(state.snapshot(),original);await assert.rejects(validateOriginalSourceRegions(original,{...source,sourceSha256:'b'.repeat(64)}));
});

test('commands serialize while independent inherited owners cannot mutate one another',async()=>{
 const parent=await createOriginalSourceRegionsState(source);await parent.add('acquisition',rect(1,1,5,5),{id:'a'});const a=await createOriginalSourceRegionsState(source,{snapshot:parent.serialize()}),b=await createOriginalSourceRegionsState(source,{snapshot:parent.serialize()});
 await Promise.all([a.toggle(false),a.setZoneEnabled('a',false),a.remove('a')]);assert.equal(a.snapshot().revision,parent.snapshot().revision+3);assert.equal(a.snapshot().zones.length,0);assert.equal(b.snapshot().fingerprint,parent.snapshot().fingerprint);assert.equal(parent.snapshot().zones[0].enabled,true);
});

test('invalid source, geometry, duplicate identity and nonboolean toggles fail atomically',async()=>{
 await assert.rejects(createOriginalSourceRegionsState({...source,width:0}));const state=await createOriginalSourceRegionsState(source);await state.add('acquisition',rect(0,0,2,2),{id:'same'});const previous=state.snapshot();await assert.rejects(state.add('exclusion',rect(3,3,6,6),{id:'same'}));await assert.rejects(state.update('same',rect(-1,0,2,2)));await assert.rejects(state.toggle('false'));assert.equal(state.snapshot(),previous);
});
