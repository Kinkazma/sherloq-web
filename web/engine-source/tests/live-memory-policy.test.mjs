import test from 'node:test';
import assert from 'node:assert/strict';
import {Budget} from '../src/cache.js';
import {LiveMemoryPolicy} from '../src/live-memory-policy.js';
import {getExecutionScheduler} from '../src/execution-scheduler.js';
const MiB=1024**2,GiB=1024**3;
const hint=(available,at=1000)=>({systemMemoryAvailableBytes:available,systemMemoryCapacityBytes:16*GiB,systemMemoryObservedAt:at});
test('live host budget excludes unmaterialized reservations and leaves active leases intact',async()=>{
 const budget=new Budget(8*GiB),scheduler=getExecutionScheduler(budget,{maxWorkers:8}),policy=new LiveMemoryPolicy(budget,{profile:'maximum',now:()=>3000});
 const lease=await scheduler.acquire({cpu:4,bytes:6*GiB}),backing=budget.registerBacking('array-buffer',GiB),reserved=budget.registerBacking('wasm',4*GiB,{state:'reserved'});
 const state=policy.update(hint(GiB));assert.equal(state.accepted,true);assert.equal(state.observation.materializedCpuBackingBytes,GiB);assert.equal(budget.limit,1843*MiB);assert.equal(lease.cpu,4);assert.equal(budget.active,6*GiB);
 lease.release();backing();reserved();assert.equal(budget.total(),0);scheduler.dispose();
});
test('repeated, stale and noisy snapshots do not churn, confirmed growth wakes waiting admissions',async()=>{
 const budget=new Budget(2*GiB),scheduler=getExecutionScheduler(budget,{maxWorkers:2}),policy=new LiveMemoryPolicy(budget,{profile:'maximum',now:()=>3000});
 const held=await scheduler.acquire({cpu:1,bytes:GiB}),pending=scheduler.acquire({cpu:1,bytes:2*GiB});let admitted=false;pending.then(()=>{admitted=true;});
 policy.update(hint(8*GiB,1000));assert.equal(budget.limit,2*GiB);assert.equal(policy.update(hint(8*GiB,1000)).accepted,false);
 policy.update(hint(8*GiB,2000));const next=await pending;assert.equal(admitted,true);assert.equal(next.cpu,1);assert.equal(policy.revision,1);
 policy.update(hint(8*GiB,2100));assert.equal(policy.revision,1);assert.equal(policy.update(hint(GiB,-4000)).accepted,false);
 held.release();next.release();scheduler.dispose();
});
test('explicit ceiling stays authoritative and idle credit cannot multiply through repeated observations',()=>{
 const budget=new Budget(2*GiB),policy=new LiveMemoryPolicy(budget,{profile:'maximum',ceiling:3*GiB,now:()=>3000}),release=budget.reserve(GiB);
 for(let at=1000;at<2000;at+=10)policy.update(hint(8*GiB,at));assert.equal(budget.limit,3*GiB);assert.equal(policy.last.materializedCpuBackingBytes,0);release();
});
