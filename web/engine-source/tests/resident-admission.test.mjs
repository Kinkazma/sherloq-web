import test from 'node:test';import assert from 'node:assert/strict';
import {createEngine} from '../src/index.js';
const pixels={width:1,height:1,format:'rgb8',data:new Uint8Array([10,20,30])};
test('Known codec capacity is admitted for imports, calculations and owned legacy copies',async()=>{
 let resident=0;const codec={memoryBytes:()=>resident,inspect:()=>({width:1,height:1}),decode:async()=>pixels,id:'test-codec'};
 const engine=createEngine({codec,memoryBudgetBytes:48*1024**2});await engine.load({id:'image',bytes:new Uint8Array([1]),pixels});resident=64*1024**2;
 for(const action of [()=>engine.load({id:'next',bytes:new Uint8Array([1]),pixels}),()=>engine.loadBlob({id:'blob',blob:new Blob([new Uint8Array([1])])}),()=>engine.run({id:'stats',imageId:'image',operation:'colors.stats'}),()=>engine.run({id:'ela',imageId:'image',operation:'ela.classic'})])await assert.rejects(action(),{code:'MEMORY_LIMIT'});
 assert.throws(()=>engine.imagePixels('image'),{code:'MEMORY_LIMIT'});assert.throws(()=>engine.original('image'),{code:'MEMORY_LIMIT'});assert.equal(engine.capabilities().memory.activeReservationBytes,0);
 resident=0;assert.deepEqual(engine.imagePixels('image'),pixels);assert.deepEqual(engine.original('image'),new Uint8Array([1]));const running=engine.run({id:'stats',imageId:'image',operation:'colors.stats'});assert.throws(()=>engine.original('image'),{code:'BUSY'});assert.throws(()=>engine.imagePixels('image'),{code:'BUSY'});await running;engine.unload('image');assert.equal(engine.capabilities().memory.retainedBytes,0);engine.dispose();
});
