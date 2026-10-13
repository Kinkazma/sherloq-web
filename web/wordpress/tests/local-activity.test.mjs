import test from 'node:test';
import assert from 'node:assert/strict';
import {withLocalActivity,localActivityBusy,localActivityFrozen,setLocalActivityFrozen} from '../sherloq-browser/assets/local-activity.js';
import {registerLocalUpdateClient} from '../sherloq-browser/assets/local-update-core.js';

test('one update probe vetoes tracked resource work and freezes new tasks until cancellation',async()=>{
 let listener,finish;const replies=[],freezes=[],worker={addEventListener(_type,fn){listener=fn;},removeEventListener(){listener=null;}},remove=registerLocalUpdateClient({serviceWorker:worker,canActivate:()=>true,onFreeze:v=>freezes.push(v)}),gate=new Promise(resolve=>finish=resolve);
 setLocalActivityFrozen(false);let pending;
 try{
  pending=withLocalActivity(()=>gate);assert.equal(localActivityBusy(),true);
  const probe=()=>listener({data:{type:'local-update-probe'},ports:[{postMessage:value=>replies.push(value)}]});
  await probe();assert.deepEqual(replies.at(-1),{ready:false});assert.deepEqual(freezes,[]);
  finish();await pending;pending=null;await probe();assert.deepEqual(replies.at(-1),{ready:true});assert.equal(localActivityFrozen(),true);
  await assert.rejects(withLocalActivity(()=>assert.fail('A new import must not begin during activation')),{code:'LOCAL_FROZEN'});
  await listener({data:{type:'local-update-cancel'}});assert.equal(localActivityFrozen(),false);assert.deepEqual(freezes,[true,false]);
  await assert.rejects(withLocalActivity(async()=>{throw Error('storage failure');}),/storage failure/);assert.equal(localActivityBusy(),false);
 }finally{finish();await pending;remove();setLocalActivityFrozen(false);}
});
