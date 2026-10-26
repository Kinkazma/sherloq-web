import test from 'node:test';
import assert from 'node:assert/strict';
import {elaCellParams} from '../src/ela-cell-pipeline.js';

test('legacy cells preserve native fractional threshold, strict zero exclusion and independent quality Auto',()=>{
 for(const threshold of [Number.MIN_VALUE,.1,2.5,2.3333333333333335,50])assert.equal(elaCellParams({threshold}).threshold,threshold);
 for(const threshold of [0,-1,50.00001,Infinity,NaN,null,'2.5'])assert.throws(()=>elaCellParams({threshold}),{code:'INVALID_INPUT'});
 assert.equal(elaCellParams({quality:0}).quality,0);
 assert.equal(elaCellParams({quality:100}).quality,100);
});
test('legacy cells preserve the complete native block lattice and exact minimum integer range',()=>{
 for(let block=16;block<=96;block+=8)assert.equal(elaCellParams({block}).block,block);
 for(const block of [0,15,17,95,97,100,16.5])assert.throws(()=>elaCellParams({block}),{code:'INVALID_INPUT'});
 for(const minimum of [1,3,1000])assert.equal(elaCellParams({minimum}).minimum,minimum);
 for(const minimum of [0,1.5,1001])assert.throws(()=>elaCellParams({minimum}),{code:'INVALID_INPUT'});
});
test('legacy Ghost phase switch is not a harmless ignored option',()=>{
 assert.equal(elaCellParams({ghost:true,allGrids:true}).allGrids,true);
 assert.throws(()=>elaCellParams({ghost:false,allGrids:true}),{code:'INVALID_INPUT'});
 for(const key of ['ghost','allGrids','background'])assert.throws(()=>elaCellParams({[key]:1}),{code:'INVALID_INPUT'});
 assert.throws(()=>elaCellParams({histogramLow:10}),{code:'INVALID_INPUT'});
});
