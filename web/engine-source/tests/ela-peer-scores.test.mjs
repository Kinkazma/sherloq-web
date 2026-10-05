import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import {createElaPeerScorer} from '../src/ela-peer-scores.js';import {Budget} from '../src/cache.js';
const ref=JSON.parse(await readFile(new URL('./data/ela-peer-native.json',import.meta.url))),wasmBinary=await readFile(new URL('../vendor/ela-peers/peers.wasm',import.meta.url));
import {input} from './ela-peer-fixture.js';

test('native cKDTree peers, robust legacy/background and 71-quality Ghost deficits',async()=>{
 const budget=new Budget(128*1024**2),scorer=createElaPeerScorer({budget,wasmBinary});
 try{for(const item of ref.cases){const base=input(item);for(const kind of ['legacy','background','ghost']){
 const result=await scorer.score({...base,kind,profiles:base[kind],qualities:kind==='ghost'?71:3});try{for(const [key,expected]of Object.entries(item[kind])){const flat=expected.flat(3).map(Number),actual=result[key];let changed=0,error=0;for(let i=0;i<flat.length;i++){changed+=Number(actual[i]!==flat[i]);error=Math.max(error,Math.abs(actual[i]-flat[i]));}assert.equal(changed,0,`${item.mode}/${kind}/${key}: ${changed} differ, max ${error}`);}}finally{result.release();}
 }} }finally{scorer.dispose();}assert.equal(budget.total(),0);
});
test('peer scorer reserves before allocation and releases failures/cancellation',async()=>{
 const base=input(ref.cases[1]);const tinyBudget=new Budget(100),tiny=createElaPeerScorer({budget:tinyBudget,wasmBinary});await assert.rejects(tiny.score({...base,profiles:base.legacy}),{code:'MEMORY_LIMIT'});tiny.dispose();assert.equal(tinyBudget.total(),0);
 const budget=new Budget(128*1024**2),scorer=createElaPeerScorer({budget,wasmBinary}),abort=new AbortController();
 try{await assert.rejects(scorer.score({...base,profiles:base.legacy},{signal:abort.signal,onProgress:()=>abort.abort()}),{code:'CANCELLED'});assert.equal(budget.total(),64*1024**2);const r=await scorer.score({...base,profiles:base.legacy});r.release();}finally{scorer.dispose();}assert.equal(budget.total(),0);
});
