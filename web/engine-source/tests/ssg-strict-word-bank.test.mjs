import test from 'node:test';
import assert from 'node:assert/strict';
import {Budget} from '../src/cache.js';
import {createOriginalSourceRegionsState,compileOriginalSourceRegions} from '../src/source-region-geometry.js';
import {createSourceRegionView} from '../src/source-region-view.js';
import {createSsgStrictSource} from '../src/ssg-strict-source.js';
import {createSsgStrictWordBank,matchSsgStrictWords} from '../src/ssg-strict-word-bank.js';
import {createSsgVlfeat} from '../src/ssg-vlfeat.js';
import {prepareSsgImage} from '../src/ssg-full-input.js';
import {ssgWordDescriptors,ssgMatchWords} from '../src/ssg.js';

async function setup(){
 const budget=new Budget(256*1024**2),width=320,height=96,state=await createOriginalSourceRegionsState({sourceSha256:'b'.repeat(64),width,height});for(const x of [0,112,224])await state.add('acquisition',{x0:x,y0:0,x1:x+96,y1:96});const domain=await compileOriginalSourceRegions(state.snapshot()),rgb=new Uint8Array(width*height*3),reads=[];for(let y=0;y<height;y++)for(let x=0;x<width;x++)for(let c=0;c<3;c++){const xx=x%112,checker=((xx>>3)^(y>>3))&1?190:40;rgb[(y*width+x)*3+c]=Math.max(0,Math.min(255,checker+Math.round(17*Math.sin(xx*.31+y*.13))+c*3));}
 const view=await createSourceRegionView({sha256:'b'.repeat(64),descriptor:{id:'SSG-native-independent',revision:1,width,height,format:'rgb8'},async readWindow(rect){const release=budget.reserve(rect.width*rect.height*3),data=new Uint8Array(rect.width*rect.height*3);for(let y=0;y<rect.height;y++)for(let x=0;x<rect.width;x++){assert(domain.contains(rect.x+x,rect.y+y));data.set(rgb.subarray(((rect.y+y)*width+rect.x+x)*3,((rect.y+y)*width+rect.x+x)*3+3),(y*rect.width+x)*3);}reads.push(rect);return{pixels:{width:rect.width,height:rect.height,format:'rgb8',data},release};}},{...domain.descriptor},{budget});const source=await createSsgStrictSource(view,{normalizationLongEdge:0},{budget});return{budget,width,height,rgb,view,source,domain,reads,async close(){await source.dispose();await view.dispose();assert.equal(budget.total(),0);}};
}

test('real native VLFeat and native word descriptors equal independent cropped-input references before one global I2NN',async()=>{
 const h=await setup();let bank,matches;const frees=[];try{
  bank=await createSsgStrictWordBank(h.source,{budget:h.budget,profile:{maxWorkers:2},candidateDomain:h.domain});assert.equal(bank.metadata.contexts.length,3);assert(bank.count>0);const parts=[];let count=0;
  for(const context of h.source.contexts){
   const native=createSsgVlfeat({budget:h.budget}),rgb=new Uint8Array(context.width*context.height*3);for(let y=0;y<context.height;y++)rgb.set(h.rgb.subarray(((context.y+y)*h.width+context.x)*3,((context.y+y)*h.width+context.x+context.width)*3),y*context.width*3);let prepared,frames;
   try{prepared=await prepareSsgImage({format:'rgb8',width:context.width,height:context.height,data:rgb},{normalizationLongEdge:0},{budget:h.budget});frames=await native.run({gray:Float32Array.from(prepared.gray),width:prepared.width,height:prepared.height});const words=await ssgWordDescriptors({gray:prepared.gray,width:prepared.width,height:prepared.height,points:frames.points},{},{reserveMemory:n=>{const release=h.budget.reserve(n);frees.push(release);return release;}});parts.push({words,context});count+=words.count;}finally{frames?.release();prepared?.release();native.dispose();}
  }
  const reference={count,points:new Float64Array(count*3),magnitudes:new Float64Array(count*4),invariants:new Float64Array(count*24),moments:new Float64Array(count*24)};let at=0;for(const{words,context}of parts){for(const key of ['points','magnitudes','invariants','moments'])reference[key].set(words[key],at*({points:3,magnitudes:4,invariants:24,moments:24}[key]));for(let i=0;i<words.count;i++){reference.points[(at+i)*3]+=context.x;reference.points[(at+i)*3+1]+=context.y;}at+=words.count;}
  for(const key of ['points','magnitudes','invariants','moments'])assert.deepEqual(bank[key],reference[key]);matches=await matchSsgStrictWords(bank,{budget:h.budget});const expected=await ssgMatchWords(reference,{}, {reserveMemory:n=>{const release=h.budget.reserve(n);frees.push(release);return release;}});assert.deepEqual(matches.pairs,expected.pairs);assert.deepEqual(matches.distances,expected.distances);assert(matches.pairs.length>0);assert(Array.from({length:matches.pairs.length/2},(_,i)=>bank.contextIds[matches.pairs[i*2]]!==bank.contextIds[matches.pairs[i*2+1]]).some(Boolean),'The real matcher must preserve relations between separate acquisitions.');
 }finally{matches?.release();bank?.release();for(const free of frees)free();await h.close();}
});

test('native word-bank cancellation retires provisional fields and does not poison a later request',async()=>{
 const h=await setup(),abort=new AbortController();let bank;try{await assert.rejects(createSsgStrictWordBank(h.source,{budget:h.budget,profile:{maxWorkers:2},signal:abort.signal,onProgress:()=>abort.abort()}),{code:'CANCELLED'});bank=await createSsgStrictWordBank(h.source,{budget:h.budget,profile:{maxWorkers:2}});assert(bank.count>0);}finally{bank?.release();await h.close();}
});
