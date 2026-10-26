import test from 'node:test';
import assert from 'node:assert/strict';
import {rasterComprintNativeContexts} from '../../extensions-source/comprint-native-contexts.js';
import {rasterComprintMap} from '../../extensions-source/comprint-statistics.js';
import {Budget} from '../src/cache.js';
test('one native context restores exactly the unchanged author nearest-coordinate raster and invalid-cell floor',async()=>{
 const width=192,height=160,rows=8,columns=12,map=Float64Array.from({length:rows*columns},(_,i)=>Math.sin(i)*400+500),valid=Uint8Array.from({length:map.length},(_,i)=>Number(i%7!==0)),native=rasterComprintMap(map,valid,Float64Array.from({length:rows},(_,i)=>49.5+i*8),Float64Array.from({length:columns},(_,i)=>49.5+i*8),width,height),budget=new Budget(16*1024**2);let owner;
 try{owner=await rasterComprintNativeContexts({outputs:{map:{data:map},valid:{data:valid}},metadata:{native_context_grids:[{index:0,width,height,rows,columns,start:0,cells:rows*columns}]}},[{x:0,y:0,width,height}],width,height,{budget});assert.deepEqual(owner.data,native);}finally{owner?.release();assert.equal(budget.active,0);}
});
test('disconnected native maps share the global valid floor; gaps and no-grid contexts are NaN, not zero scores',async()=>{
 const budget=new Budget(16*1024**2),contexts=[{x:0,y:0,width:100,height:100},{x:140,y:0,width:100,height:100},{x:110,y:110,width:4,height:4}],grids=[{index:0,width:100,height:100,rows:1,columns:1,start:0,cells:1},{index:1,width:100,height:100,rows:1,columns:1,start:1,cells:1},{index:2,width:4,height:4,rows:0,columns:0,start:2,cells:0}];let owner;try{owner=await rasterComprintNativeContexts({outputs:{map:{data:Float64Array.of(17,999)},valid:{data:Uint8Array.of(1,0)}},metadata:{native_context_grids:grids}},contexts,240,120,{budget});assert.equal(owner.data[0],17);assert.equal(owner.data[140],17);assert(Number.isNaN(owner.data[110]));assert(Number.isNaN(owner.data[111*240+111]));}finally{owner?.release();assert.equal(budget.active,0);}
});
