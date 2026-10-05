import assert from 'node:assert/strict';import {Budget} from '../src/cache.js';import {comparisonPagedSewar} from '../src/comparison-paged-sewar.js';import {comparisonPagedSsimulacra} from '../src/comparison-paged-ssimulacra.js';
import {comparisonPagedButteraugli} from '../src/comparison-paged-butteraugli.js';
const butter=async(images,options)=>comparisonPagedButteraugli(images,null,options);
for(const compute of [comparisonPagedSewar,comparisonPagedSsimulacra,butter])for(const kind of ['cancel','read','write']){
 const budget=new Budget(64*1024**2),controller=new AbortController();let alive=0;const failure=Object.assign(Error('injected '+kind),{code:'M4_TEST_IO'});
 const session={async create(){alive++;return {readInto(out){if(kind==='read')throw failure;out.fill(0);},write(){if(kind==='write')throw failure;},dispose(){alive--;}};}};
 const image={surface:{descriptor:{width:40,height:80},async readWindow(){if(kind==='cancel')controller.abort();return {pixels:{data:new Uint8Array(120)},release(){}};}}};
 await assert.rejects(compute([image,image],{budget,signal:controller.signal,temporarySession:session}),kind==='cancel'?e=>e.code==='CANCELLED':e=>e===failure);assert.equal(alive,0);assert.equal(budget.total(),0);console.log(compute.name,kind,'error identity and cleanup verified');
}
