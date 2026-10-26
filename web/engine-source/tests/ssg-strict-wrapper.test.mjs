import test from 'node:test';
import assert from 'node:assert/strict';
import {Budget} from '../src/cache.js';
import {createOriginalSourceRegionsState,compileOriginalSourceRegions} from '../src/source-region-geometry.js';
import {createStrictSsgCopyEngine} from '../src/ssg-strict-copy.js';
import {prepareSparseStrictNativeContext} from '../src/sparse-strict-source.js';
import {createSsgStrictCompiledView} from '../src/ssg-strict-compiled-view.js';
import {createSsgStrictSource} from '../src/ssg-strict-source.js';

const profile={maxWorkers:2},models={'ssg-edges':{url:'https://controlled.invalid/forest',bytes:10,sha256:'f'.repeat(64)}},excluded=[[[18,18],[22,18],[22,22],[18,22]]];
async function fixture({poison=0,border=false}={}){
 const width=320,height=96,budget=new Budget(1024**3),state=await createOriginalSourceRegionsState({sourceSha256:'d'.repeat(64),width,height});for(const x of[0,112,224])await state.add('acquisition',{x0:x,y0:0,x1:x+96,y1:96});if(border)await state.add('exclusion',{x0:0,y0:0,x1:2,y1:96});const domain=await compileOriginalSourceRegions(state.snapshot()),counts={forest:0,reads:0},rgb=new Uint8Array(width*height*3);for(let y=0;y<height;y++)for(let x=0;x<width;x++)for(let c=0;c<3;c++){const xx=x%112;rgb[(y*width+x)*3+c]=x>=18&&x<22&&y>=18&&y<22?poison:Math.max(0,Math.min(255,(((xx>>3)^(y>>3))&1?190:40)+Math.round(17*Math.sin(xx*.31+y*.13))+c*3));}
 const source={sha256:'d'.repeat(64),surface:{descriptor:{id:'Original',revision:1,format:'rgb8',width,height},async readWindow(rect){counts.reads++;const free=budget.reserve(rect.width*rect.height*3),data=new Uint8Array(rect.width*rect.height*3);for(let y=0;y<rect.height;y++)for(let x=0;x<rect.width;x++){const xx=x+rect.x,yy=y+rect.y;assert(!(xx>=18&&xx<22&&yy>=18&&yy<22),'Tool-excluded RGB reached normalization or a native model.');if(border)assert(xx>=2);data.set(rgb.subarray((yy*width+xx)*3,(yy*width+xx)*3+3),(y*rect.width+x)*3);}return{pixels:{format:'rgb8',width:rect.width,height:rect.height,data},release:free};}}},record={...source,sourceRegionDomain:domain.descriptor,...(border?{originalSource:source,surface:{descriptor:{id:'derived',revision:1,format:'rgb8',width:318,height},readWindow(){throw Error('Derived/black painted surface was used.');}}}:{})};
 const engine=createStrictSsgCopyEngine(record,budget,profile,{edgesFactory:()=>({async run({rgb,width,height}){counts.forest++;return{edgeMap:Float32Array.from({length:width*height},(_,i)=>rgb[i*3]/255),metadata:{controlledForest:true},release(){}};},dispose(){}})});
 return{budget,domain,record,engine,counts,async close(){await engine.dispose();assert.equal(budget.total(),0);}};
}
test('tool true exclusions are compiled before native source input, while candidate gaps stay a separate certified population',async()=>{
 const a=await fixture({poison:0}),b=await fixture({poison:255});let first,other,warm;try{
  first=await a.engine.analyze({algorithm:'SSG',normalizationLongEdge:0,excluded},{models});other=await b.engine.analyze({algorithm:'SSG',normalizationLongEdge:0,excluded},{models});for(const key of['points','pairs','models','mask'])assert.deepEqual(first[key],other[key]);assert.equal(first.metadata.nativeContexts.admittedPixels,320*96-16);assert.equal(first.metadata.scientificDefinitions.localization.admittedPixels,96*96*3-16);const reads=a.counts.reads,calls=a.counts.forest;warm=await a.engine.analyze({algorithm:'SSG',normalizationLongEdge:0,excluded,maskThreshold:.8},{models});assert.equal(warm.metadata.stageCache.nativeCheckpoint,true);assert.equal(a.counts.reads,reads);assert.equal(a.counts.forest,calls);for(let y=0;y<96;y++)for(let x=0;x<320;x++)if(!a.domain.contains(x,y)||x>=18&&x<22&&y>=18&&y<22){assert.equal(first.mask[y*320+x],0);assert.equal(first.directSsimSupport[y*320+x],0);}
 }finally{for(const v of[first,other,warm])v?.release();await a.close();await b.close();}
});
test('retained compiled source lifetime is independent of the completed request signal',async()=>{
 const h=await fixture(),abort=new AbortController();let first,next;try{first=await h.engine.analyze({algorithm:'SSG',normalizationLongEdge:0,excluded},{models,signal:abort.signal});abort.abort();next=await h.engine.analyze({algorithm:'SSG',normalizationLongEdge:0,excluded,roiRadius:20},{models});assert.equal(next.metadata.stageCache.nativeCheckpoint,true);assert.deepEqual(next.points,first.points);}finally{first?.release();next?.release();await h.close();}
});
test('a strict border exclusion does not replace the common normalization frame with the smaller context bbox',async()=>{
 const h=await fixture({border:true});let prepared,view,source;try{
  // Use the real source localization contract, rather than weakening its
  // mandatory receipt check for this lower-level geometry-only proof.
  const original={...h.record,surface:{descriptor:{format:'rgb8',width:320,height:96},readWindow:h.record.originalSource.surface.readWindow},sourceRegionDomain:undefined,originalSource:undefined};prepared=await prepareSparseStrictNativeContext(original,{operation:'tampering.copyMove.sparse',params:{algorithm:'SSG',normalizationLongEdge:0,excluded:[...excluded,[[0,0],[2,0],[2,96],[0,96]]]}},{budget:h.budget});view=await createSsgStrictCompiledView(prepared,{budget:h.budget});source=await createSsgStrictSource(view.view,{normalizationLongEdge:0},{budget:h.budget});assert.equal(source.width,320);assert.equal(source.height,96);assert.deepEqual(source.origin,[0,0]);assert(source.contexts.every(c=>c.x>=2));assert.equal(source.scaleX,1);assert.equal(source.scaleY,1);assert.equal(source.contexts.reduce((n,r)=>n+r.width*r.height,0),318*96-16);await source.dispose();
  // This is the real APPLICATION DEFAULT grid, not a replacement parameter
  // chosen to make a native model fit the small fixture. Only normalization
  // and source ownership execute; no VLFeat, forest or CNN is called here.
  source=await createSsgStrictSource(view.view,{},{budget:h.budget});assert.equal(source.parameters.normalizationLongEdge,3000);assert.equal(source.width,3000);assert.equal(source.height,900);assert.equal(source.scaleX,9.375);assert.equal(source.scaleY,9.375);assert.equal(Math.min(...source.contexts.map(c=>c.x)),19);assert.equal(Math.max(...source.contexts.map(c=>c.x+c.width)),3000);assert.equal(Math.min(...source.contexts.map(c=>c.y)),0);assert.equal(Math.max(...source.contexts.map(c=>c.y+c.height)),900);for(const context of source.contexts){assert(Math.floor((context.x+.5)/source.scaleX)>=2);assert(Math.floor((context.x+context.width-.5)/source.scaleX)<=319);}const first=await source.read(source.contexts[0]);try{assert(first.rgb.every(Number.isFinite));assert(first.gray.every(Number.isFinite));assert(first.metadata.incompleteCubicSupportPixels>0);}finally{first.release();}
 }finally{await source?.dispose();await view?.dispose();prepared?.release();await h.close();}
});
