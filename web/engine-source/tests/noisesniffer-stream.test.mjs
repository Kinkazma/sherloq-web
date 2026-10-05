import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {noisesnifferStreamMath} from '../src/noisesniffer-stream-math.js';
const file=f=>readFile(new URL('../fixtures/'+f,import.meta.url));
const refs=JSON.parse(await file('noisesniffer-reference.json'));
const reflect=(i,n)=>{while(i<0||i>=n)i=i<0?-i:2*n-i-2;return i;};
test('segmented statistics preserve native global means, validity and DCT',async()=>{
 const math=await noisesnifferStreamMath();let cases=0;
 for(const c of refs.cases){
  const W=c.width,H=c.height,w=c.block,cols=W-w+1,rows=H-w+1,n=cols*rows,rgb=new Uint8Array(await file(c.input.file)),extrema=[255,255,255,0,0,0];
  for(let i=0;i<rgb.length;i++){const k=i%3;extrema[k]=Math.min(extrema[k],rgb[i]);extrema[k+3]=Math.max(extrema[k+3],rgb[i]);}
  const means=new Float64Array(n*3),variance=new Float32Array(n*3),valid=[];
  const step=Math.min(17,rows);
  for(let y=0;y<rows;y+=step){const h=Math.min(step,rows-y),r=math.blocks(rgb.subarray(y*W*3,(y+h+w-1)*W*3),W,h+w-1,w,extrema);if(r.means)means.set(r.means,y*cols*3);for(let i=0;i<r.valid.length;i++)if(r.valid[i])valid.push(y*cols+i);for(let k=0;k<3;k++)variance.set(r.variance.subarray(k*h*cols,(k+1)*h*cols),k*n+y*cols);}
  if(w===8){const dw=math.optimal(Math.min(249,W)+7),dh=math.optimal(Math.min(249,H)+7),bw=Math.min(dw-7,W),bh=Math.min(dh-7,H);
   for(let y=0;y<H;y+=bh)for(let x=0;x<W;x+=bw){const tw=Math.min(bw,W-x),th=Math.min(bh,H-y),tile=new Uint8Array((tw+7)*(th+7)*3);for(let yy=0;yy<th+7;yy++)for(let xx=0;xx<tw+7;xx++){const at=(reflect(y+yy-4,H)*W+reflect(x+xx-4,W))*3;tile.set(rgb.subarray(at,at+3),(yy*(tw+7)+xx)*3);}const r=math.mean8(tile,tw,th,dw,dh,bh);for(let yy=0;yy<th;yy++)for(let xx=0;xx<tw;xx++){const gx=x+xx-4,gy=y+yy-4;if(gx>=0&&gx<cols&&gy>=0&&gy<rows)means.set(r.means.subarray((yy*tw+xx)*3,(yy*tw+xx+1)*3),(gy*cols+gx)*3);}}
  }
  for(const [key,actual,Type] of [['valid',BigInt64Array.from(valid,BigInt),BigInt64Array],['means',means,Float64Array],['variance',variance,Float32Array]]){const bytes=await file(c.statistics[key].file),expected=new Type(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength));assert.equal(actual.length,expected.length,c.name+' '+key);let different=0,first;for(let i=0;i<actual.length;i++)if(!Object.is(actual[i],expected[i])){different++;first??={i,a:actual[i],e:expected[i]};}assert.equal(different,0,c.name+' '+key+' '+String(first&&JSON.stringify(first)));}
  cases++;
 }console.log({cases});
});

import {createHash} from 'node:crypto';
import {Budget} from '../src/cache.js';
import {contiguousSurface} from '../src/image-sources.js';
import {segmentedNoisesnifferStatistics} from '../src/segmented-noisesniffer-statistics.js';
const digest=a=>createHash('sha256').update(new Uint8Array(a.buffer,a.byteOffset,a.byteLength)).digest('hex');
test('megapixel segmented statistics retain global FFT grid and clean cancellation',async()=>{
 const ref=JSON.parse(await file('noisesniffer-large-reference.json')),W=ref.width,H=ref.height,rgb=new Uint8Array(W*H*3);let state=ref.seed;
 for(let y=0;y<H;y++)for(let x=0;x<W;x++)for(let c=0;c<3;c++){state=(Math.imul(1664525,state)+1013904223)>>>0;rgb[(y*W+x)*3+c]=x>=Math.floor(W*2/5)&&x<Math.floor(W/2)&&y>=Math.floor(H*2/5)&&y<Math.floor(H/2)?124+(state>>>16)%7:70+(state>>>16)%117;}
 assert.equal(digest(rgb),ref.inputSha256);
 const budget=new Budget(128*1024**2),image={surface:contiguousSurface({width:W,height:H,data:rgb},budget)};
 for(const f of ref.cases){const s=await segmentedNoisesnifferStatistics(image,f.block,{budget,blockPixels:16384}),valid=new Uint8Array(s.width*s.height);await s.valid.readInto(valid);assert.equal(s.validCount,f.validCount);assert.equal(digest(Uint32Array.from(Array.from(valid.keys()).filter(i=>valid[i]))),f.statistics.valid);for(const key of ['means','variance']){const plane=s[key],a=await plane.read(0,0,plane.width,plane.height);assert.equal(digest(a),f.statistics[key],key+'/'+f.block);}await s.dispose();assert.equal(budget.total(),0);}
 for(const phase of ['noisesniffer-extrema','noisesniffer-dct','noisesniffer-means-fft']){const controller=new AbortController();await assert.rejects(segmentedNoisesnifferStatistics(image,8,{budget,signal:controller.signal,onProgress:p=>{if(p.phase===phase)controller.abort();}}),{code:'CANCELLED'});assert.equal(budget.total(),0);}
});
