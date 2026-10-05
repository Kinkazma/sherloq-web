import assert from 'node:assert/strict';
import {Budget} from '../src/cache.js';
import {comparisonPagedHistograms} from '../src/comparison-paged-histograms.js';
for(const kind of ['cancel','read','write']){
 const budget=new Budget(64*1024**2),controller=new AbortController();let alive=0;
 const failure=Object.assign(Error('injected '+kind),{code:'M4_TEST_IO'});
 const session={async create(){alive++;return {readInto(out){if(kind==='read')throw failure;out.fill(0);},write(){if(kind==='write')throw failure;},dispose(){alive--;}};}};
 const image={surface:{descriptor:{width:1,height:1},async readWindow(){if(kind==='cancel')controller.abort();return {pixels:{data:new Uint8Array(3)},release(){}};}}};
 await assert.rejects(comparisonPagedHistograms([image,image],{budget,signal:controller.signal,resident:false,cachePages:1,temporarySession:session}),kind==='cancel'?e=>e.code==='CANCELLED':e=>e===failure);
 assert.equal(alive,0);assert.equal(budget.total(),0);console.log(kind,'original error and cleanup verified');
}
