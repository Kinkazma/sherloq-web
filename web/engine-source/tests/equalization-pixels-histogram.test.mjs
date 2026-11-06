import test from 'node:test';
import assert from 'node:assert/strict';
import {Budget} from '../src/cache.js';
import {createRgbSurface} from '../src/rgb-surface.js';
import {equalizationPixels} from '../src/equalization-pixels.js';
import {prepareEqualization} from '../src/equalization-presentation.js';
import {globalHistogramSurface} from '../src/equalization-global-histogram.js';
import {equalizationPlan,equalizationState} from '../src/equalization-settings.js';

const state=equalizationState();state.method='histogram';
const plan=equalizationPlan('ela.classic',{scale:1,contrast:0,linear:false,grayscale:false,equalization:state});
function fixture(kind){
 const width=17,height=13,data=Uint8Array.from({length:width*height*3},(_,i)=>kind==='black'?0:kind==='constant'?128:(Math.imul(i,37)+(i>>2)*19)%256);
 return{width,height,format:'rgb8',data};
}
async function historical(pixels,budget,contains){
 const store={byteLength:pixels.data.length,readInto(out,offset=0){out.set(pixels.data.subarray(offset,offset+out.length));},dispose(){}},source=createRgbSurface(store,{width:pixels.width,height:pixels.height,budget,ownsStore:false});let program;
 try{program=await prepareEqualization(source,plan,{budget,...(contains?{contains}:{})});const expected=pixels.data.slice();program.map(expected,0,0,pixels.width,pixels.height);return expected;}finally{program?.dispose();await source.dispose();}
}
for(const kind of ['varied','black','constant'])for(const masked of [false,true])test('Histogram100 pixel proxy matches the historical HSV-V mapping: '+kind+(masked?' masked':''),async()=>{
 const budget=new Budget(16*1024**2),pixels=fixture(kind),before=pixels.data.slice(),contains=masked?(x,y)=>x%5!==2&&y%4!==1:undefined;
 try{const expected=await historical(pixels,budget,contains);assert.equal(budget.total(),0);const output=await equalizationPixels(pixels,plan,{budget,backend:'cpu',...(contains?{contains}:{})});
  assert.equal(output.width,pixels.width);assert.equal(output.height,pixels.height);assert.equal(output.format,'rgb8');assert(output.data instanceof Uint8Array);assert.deepEqual(output.data,expected);assert.deepEqual(pixels.data,before);assert.notEqual(output.data,pixels.data);assert.equal(budget.total(),0);
  if(contains)for(let y=0;y<pixels.height;y++)for(let x=0;x<pixels.width;x++)if(!contains(x,y)){const i=(y*pixels.width+x)*3;assert.deepEqual(output.data.subarray(i,i+3),before.subarray(i,i+3));}
 }finally{assert.equal(budget.total(),0);}
});
for(const phase of ['before','equalization-statistics','equalization-render'])test('cancelled Histogram100 pixel proxy releases every owner: '+phase,async()=>{
 const budget=new Budget(16*1024**2),pixels=fixture('varied'),before=pixels.data.slice(),controller=new AbortController();if(phase==='before')controller.abort();
 await assert.rejects(equalizationPixels(pixels,plan,{budget,backend:'cpu',signal:controller.signal,onProgress:event=>{if(event.phase===phase)controller.abort();}}),{code:'CANCELLED'});assert.deepEqual(pixels.data,before);assert.equal(budget.total(),0);
});
test('global Histogram100 still rejects an undeclared RGB8 surface',async()=>{
 const budget=new Budget(16*1024**2);await assert.rejects(globalHistogramSurface({descriptor:{width:1,height:1},readWindow(){throw Error('The guard must run before any read');}},{budget}),{code:'INVALID_INPUT',message:'Global HSV equalization requires RGB8.'});assert.equal(budget.total(),0);
});
