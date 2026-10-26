import test from 'node:test';
import assert from 'node:assert/strict';
import {renderResearch} from '../src/research-render.js';
import {Budget} from '../src/cache.js';

function fixture(method,height){
 const width=16,image={width,height,data:Uint8Array.from({length:width*height*3},(_,i)=>i%251)};
 const data=method==='adaptive_cfa'?{metadata:{method,origin:[4,4],valid_shape:[8,8],block:8},suspicion:Float32Array.of(.5),local_grid:Uint8Array.of(1)}:{metadata:{method},width:1,height:1,map:Float32Array.of(.5)};
 return{image,data};
}
for(const method of['adaptive_cfa','catnet'])for(const height of[16,33,65])for(const phase of['pre','first','last'])test(method+' renderer honors '+phase+' abort at height'+height,async()=>{
 const{image,data}=fixture(method,height),original=image.data.slice(),budget=new Budget(1024**2),controller=new AbortController();let callbacks=0;
 if(phase==='pre')controller.abort();
 await assert.rejects(renderResearch(image,data,0,{budget,signal:controller.signal,onProgress:p=>{callbacks++;if(phase==='first'&&p.fraction===0||phase==='last'&&p.fraction===Math.floor((height-1)/32)*32/height)controller.abort();}}),{code:'CANCELLED'});
 assert.deepEqual(image.data,original);assert.equal(budget.total(),0);assert.equal(callbacks,phase==='pre'?0:phase==='first'?1:Math.floor((height-1)/32)+1);
});
for(const method of['adaptive_cfa','catnet'])test(method+' final callback error remains the original error and releases output',async()=>{
 const{image,data}=fixture(method,65),budget=new Budget(1024**2),error=Object.assign(Error('controlled final callback'),{code:'CONTROLLED_CALLBACK'});
 await assert.rejects(renderResearch(image,data,2,{budget,onProgress:p=>{if(p.fraction===64/65)throw error;}}),e=>e===error);assert.equal(budget.total(),0);
});
