import assert from 'node:assert/strict';
import {Budget} from '../src/cache.js';
const budget=new Budget(1000),retainedReleases=[];
let weak;
(function(){const identity=new ArrayBuffer(1024);weak=new WeakRef(identity);retainedReleases.push(budget.registerBacking('array-buffer',1024,{identity}),budget.registerBacking('array-buffer',1024,{identity}));})();
retainedReleases[0]();await new Promise(resolve=>setImmediate(resolve));global.gc();assert(weak.deref(),'The live alias owns this identity');
retainedReleases[1]();
for(let i=0;i<20;i++){await new Promise(resolve=>setImmediate(resolve));global.gc();if(!weak.deref())break;}
assert.equal(weak.deref(),undefined,'Retired release closures must not retain their identity ArrayBuffer');
assert.equal(retainedReleases.length,2);assert.equal(budget.resourceSnapshot().domains['array-buffer'].backings,0);
console.log(JSON.stringify({retainedReleaseClosures:retainedReleases.length,identityCollected:true,backings:0}));
