import test from 'node:test';
import assert from 'node:assert/strict';
import {Budget} from '../src/cache.js';
import {createRgb16Bank} from '../src/rgb16-surface.js';
import {contiguousSurface} from '../src/image-sources.js';
import {segmentedFrequency} from '../src/segmented-frequency.js';
import {frequencyStreamMath} from '../src/frequency-stream-math.js';
import {gray} from '../src/pixel-utils.js';
const bits=a=>new Uint32Array(a.buffer,a.byteOffset,a.length);
const views=r=>[r.surface,...['high','magnitude','phase'].map(k=>r.rgbRecords[k].surface)];
const release=r=>Promise.all([...views(r),r.tableRecords.mask.surface].map(v=>v.dispose()));
const shift=(input,width,height,inverse=false)=>{const out=new Float32Array(input.length),dx=inverse?Math.ceil(width/2):Math.floor(width/2),dy=inverse?Math.ceil(height/2):Math.floor(height/2);for(let y=0;y<height;y++)for(let x=0;x<width;x++){const from=(y*width+x)*2,to=(((y+dy)%height)*width+(x+dx)%width)*2;out[to]=input[from];out[to+1]=input[from+1];}return out;};
function oracle(math,data,sw,sh,p){
 const width=math.optimal(sw),height=math.optimal(sh),n=width*height,grayValues=new Float32Array(n);
 for(let y=0;y<sh;y++)for(let x=0;x<sw;x++){const i=(y*sw+x)*3;grayValues[y*width+x]=gray(data[i],data[i+1],data[i+2]);}
 const fft=math.full(grayValues,width,height),spectrum=shift(fft,width,height),polar=math.polar(spectrum),parts=[0,1].map(k=>Float32Array.from({length:n},(_,i)=>polar[i*2+k]));
 for(let k=0;k<2;k++)parts[k]=math.normalize(parts[k],Math.min(...parts[k]),Math.max(...parts[k]));
 const horizontal=math.maskHorizontal(width,height,0,height,p.split,p.smooth),columns=new Float32Array(n);
 for(let x=0;x<width;x++)for(let y=0;y<height;y++)columns[x*height+y]=horizontal[y*width+x];
 const vertical=math.maskVertical(columns,width,height,width,p.smooth),maximum=Math.max(...vertical),weights=new Float32Array(n);let zero=0;
 for(let x=0;x<width;x++)for(let y=0;y<height;y++){const i=y*width+x;weights[i]=vertical[x*height+y]/maximum;if(p.threshold&&parts[0][i]<Math.trunc(p.threshold/100*255))weights[i]=0;if(weights[i]===0)zero++;}
 const frames=[];
 for(let high=0;high<2;high++){
  const filtered=new Float32Array(spectrum.length);for(let i=0;i<n;i++){const weight=high?Math.fround(1-weights[i]):weights[i];filtered[i*2]=spectrum[i*2]*weight;filtered[i*2+1]=spectrum[i*2+1]*weight;}
  const inverse=math.full(shift(filtered,width,height,true),width,height,true),magnitude=math.polar(inverse,{reconstruction:true,offset:0,total:n,columns:width});let lo=Infinity,hi=-Infinity;
  for(let y=0;y<height;y++)for(let x=0;x<width;x++)if(high||y<sh&&x<sw){lo=Math.min(lo,magnitude[y*width+x]);hi=Math.max(hi,magnitude[y*width+x]);}
  const normalized=math.normalize(magnitude,lo,hi),frame=new Uint8Array(sw*sh*3);for(let y=0;y<sh;y++)for(let x=0;x<sw;x++)frame.fill(normalized[y*width+x],(y*sw+x)*3,(y*sw+x+1)*3);frames.push(frame);
 }
 for(let k=0;k<2;k++){let display=Float32Array.from({length:n},(_,i)=>Math.trunc(Math.fround(parts[k][i]*weights[i]))&255);if(p.filter)display=math.gaussian8(display,width,height,p.filter);const frame=new Uint8Array(n*3);for(let i=0;i<n;i++)frame.fill(display[i],i*3,i*3+3);frames.push(frame);}
 return{fft,polar:Float32Array.from({length:n*2},(_,i)=>parts[i%2][Math.floor(i/2)]),frames,weights,width,height,zeroPercent:p.threshold?zero/n*100:0};
}
const parameters=[{split:0,smooth:0,threshold:0,filter:0},{split:15,smooth:25,threshold:20,filter:3},{split:100,smooth:100,threshold:0,filter:0},{split:45,smooth:1,threshold:37,filter:0}];
for(const sourceDepth of [10,12,14,16])test(`frequency consumes the exact retained uint16 bank for sourceDepth ${sourceDepth}`,async()=>{
 const budget=new Budget(96*1024**2),math=await frequencyStreamMath(),sw=19,sh=17,data=Uint16Array.from({length:sw*sh*3},(_,i)=>30000+(i*73+Math.floor(i/9)*139)%127),original=data.slice();
 const bank=await createRgb16Bank({width:sw,height:sh,budget,storage:'memory',sourceDepth});await bank.writeBand({y:0,width:sw,rows:sh,data:new Uint8Array(data.buffer)});const surface=await bank.seal(),image={surface};let cache;
 try{for(const p of parameters){const expected=oracle(math,data,sw,sh,p),result=await segmentedFrequency(image,p,{budget,cache,blockPixels:137});cache=result.frequencyCache;
  try{assert.equal(result.metrics.inputDepth,16);assert.equal(result.metrics.numericalInputDepth,16);assert.equal(result.metrics.sourceDepth,sourceDepth);assert.equal(cache.sourceSurfaceId,surface.descriptor.id);assert.equal(cache.inputDepth,16);assert.deepEqual(bits(await cache.fft.read(0,0,expected.width,expected.height)),bits(expected.fft),'complete native16 FFT bits');assert.deepEqual(bits(await cache.polar.read(0,0,expected.width,expected.height)),bits(expected.polar),'globally normalized native16 polar bits');assert.equal(result.data.zeroPercent,expected.zeroPercent);
   for(const [index,view]of views(result).entries()){const part=await view.readWindow();try{assert.deepEqual(part.pixels.data,expected.frames[index],`view ${index}`);}finally{part.release();}}
   const page=await result.tableRecords.mask.surface.readRows({offset:0,length:expected.weights.length});try{assert.deepEqual(bits(Float32Array.from({length:page.length},(_,i)=>page.data[i*3+2])),bits(expected.weights));}finally{page.release();}
  }finally{await release(result);}
 }
 const r8=new Uint8Array(data.length);for(let i=0;i<r8.length;i++)r8[i]=Math.round(data[i]/257);assert.equal(new Set(r8).size,1,'the fixture is flat after RGB8 quantization');
 const promoted=Uint16Array.from(r8,v=>v*257),nativeFft=oracle(math,data,sw,sh,parameters[0]).fft,promotedFft=oracle(math,promoted,sw,sh,parameters[0]).fft;assert.notDeepEqual(bits(nativeFft),bits(promotedFft),'sub8bit detail survives in the scientific FFT');
 const otherBank=await createRgb16Bank({width:sw,height:sh,budget,sourceDepth});await otherBank.writeBand({y:0,rows:sh,data:new Uint8Array(data.buffer)});const other=await otherBank.seal();try{await assert.rejects(segmentedFrequency({surface:other},{},{budget,cache}),/another source or numerical depth/);}finally{await otherBank.dispose();}
 const rgb8=contiguousSurface({width:sw,height:sh,format:'rgb8',data:r8},budget);await assert.rejects(segmentedFrequency({surface:rgb8},{},{budget,cache}),/another source or numerical depth/);
 const source=await surface.readWindow();try{assert.deepEqual(source.pixels.data,original);}finally{source.release();}assert.deepEqual(data,original);
 }finally{await cache?.dispose();await bank.dispose();}assert.equal(budget.total(),0);
});
test('native16 frequency refuses a mislabeled RGB8 reader without creating a promoted source',async()=>{
 const budget=new Budget(48*1024**2),surface={descriptor:{id:'mislabeled',revision:1,width:5,height:3,format:'rgb16',depth:16,sourceDepth:10},async readWindow({width,height}){return{pixels:{width,height,format:'rgb8',data:new Uint8Array(width*height*3)},release(){}};}};
 await assert.rejects(segmentedFrequency({surface},{},{budget,blockPixels:64}),/real uint16/);assert.equal(budget.total(),0);
});
test('native16 frequency cancellation during reconstruction retains only the original bank',async()=>{
 const budget=new Budget(48*1024**2),width=37,height=31,bank=await createRgb16Bank({width,height,budget,sourceDepth:12}),data=Uint16Array.from({length:width*height*3},(_,i)=>(i*509)%65536);await bank.writeBand({y:0,rows:height,data:new Uint8Array(data.buffer)});const surface=await bank.seal(),baseline=budget.total(),controller=new AbortController();
 try{await assert.rejects(segmentedFrequency({surface},{},{budget,blockPixels:128,signal:controller.signal,onProgress:event=>{if(event.phase==='frequency-reconstruction')controller.abort();}}),{code:'CANCELLED'});assert.equal(budget.total(),baseline);const part=await surface.readWindow();try{assert.deepEqual(part.pixels.data,data);}finally{part.release();}}finally{await bank.dispose();}assert.equal(budget.total(),0);
});
