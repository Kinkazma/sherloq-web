import test from 'node:test';
import assert from 'node:assert/strict';
import {createBatchPreparationClient} from '../sherloq-browser/assets/batch-preparation-client.js';

test('preparation client transports explicit detectText false and textOnly without changing backend or resource profile',async()=>{
 const calls=[],released=[],configuration={methods:{forgeryscope:{id:'classifier'}},text:{asset:{id:'ocr'}}},metadata={text:{status:'complete',disabled:true}};
 const api=await createBatchPreparationClient({configuration,computeProfile:'maximum',memoryBudgetBytes:4194304,clientFactory:async config=>{assert.equal(config.computeProfile,'maximum');assert.equal(config.memoryBudgetBytes,4194304);return {ready:true,analyzeBlob:async(...args)=>{calls.push(args);return {id:calls.length};},metadata:async()=>metadata,release:async id=>released.push(id),dispose:async()=>{},memory:()=>({})};}});
 const blob=new Blob(['original']),signal=new AbortController().signal,onProgress=()=>{};
 try{assert.equal(await api.prepare(blob,{detectText:false,textOnly:true,backend:'webgpu',name:'original.png',signal,onProgress}),metadata);assert.deepEqual(calls[0],['scientific-preparation',blob,{textOnly:true,detectText:false,name:'original.png'},{signal,onProgress,backend:'webgpu'}]);await api.prepare(blob);assert.equal(calls[1][2].detectText,true);assert.deepEqual(released,[1,2]);await assert.rejects(api.prepare(blob,{detectText:'false'}),{code:'INVALID_INPUT'});assert.equal(calls.length,2);}finally{await api.dispose();}
});
