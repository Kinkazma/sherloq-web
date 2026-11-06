import test from 'node:test';import assert from 'node:assert/strict';
import {Budget} from '../src/cache.js';
import {createRgbSurface} from '../src/rgb-surface.js';
import {createRgbRecompression} from '../src/jpeg-rgb-stream.js';
import {toneTable,fusedCpu} from '../src/ela-lut.js';
import {validateParams} from '../src/ela.js';
import {createSourceRegionView} from '../src/source-region-view.js';
import {createOriginalSourceRegionsState,compileOriginalSourceRegions} from '../src/source-region-geometry.js';
import {sourceRegionEla} from '../src/source-region-ela.js';
import {previewSourceRegionClassic} from '../src/source-region-classic-preview.js';
const sha='a'.repeat(64);
async function fixture({width=43,height=37,shape='hole',poison=false,budgetBytes=128*1024**2}={}){
 const budget=new Budget(budgetBytes),state=await createOriginalSourceRegionsState({sourceSha256:sha,width,height});
 if(shape==='hole')await state.add('exclusion',{x0:19,y0:17,x1:21,y1:19});
 if(shape==='disjoint'){await state.add('acquisition',{x0:2.8,y0:3.2,x1:14.2,y1:32.8});await state.add('acquisition',{x0:28.8,y0:4.2,x1:41.2,y1:34.8});}
 if(shape==='slivers'){await state.add('acquisition',{x0:1,y0:1,x1:2,y1:height-1});await state.add('acquisition',{x0:width-2,y0:1,x1:width-1,y1:height-1});}
 const domain=await compileOriginalSourceRegions(state.snapshot()),data=Uint8Array.from({length:width*height*3},(_,i)=>((i*73)^((i>>>4)*37)^((i>>>8)*193))&255);
 if(poison)for(let y=0;y<height;y++)for(let x=0;x<width;x++)if(!domain.containsOriginal(x,y))for(let c=0;c<3;c++)data[(y*width+x)*3+c]^=255;
 const surface=createRgbSurface({byteLength:data.length,readInto:(out,offset)=>out.set(data.subarray(offset,offset+out.length))},{width,height,budget,ownsStore:false}),original={surface,sha256:sha},derived={},view=await createSourceRegionView({...surface,sha256:sha},domain.descriptor,{budget}),read=view.readWindow.bind(view),science=[];
 view.readWindow=(rect,hooks)=>{assert(view.includesRectangle(rect),'Excluded samples entered JPEG or ELA');science.push({...rect});return read(rect,hooks);};const records=[];
 return{budget,width,height,data,surface,original,derived,domain,view,science,records,publishResult(_,record){records.push(record);return{surface:record.surface.descriptor,planeSurfaces:{analysis_scope:record.planeRecords.analysis_scope.surface.descriptor}};},async cleanup(){for(const record of records){await record.surface.dispose();await record.planeRecords.analysis_scope.surface.dispose();}await derived.rgbRecompression?.dispose();await derived.sourceRegionRecompressionCache?.dispose();view.dispose();await surface.dispose();budget.clearPrefix('test\0');assert.equal(budget.total(),0);}};
}
async function read(surface){const d=surface.descriptor,window=await surface.readWindow({x:0,y:0,width:d.width,height:d.height});try{return window.pixels.data.slice();}finally{window.release();}}
function call(h,params={},hooks={}){return sourceRegionEla({task:{id:'job',imageId:'test',operation:'ela.classic',params},original:h.original,derived:h.derived,view:h.view,domain:h.domain,budget:h.budget,publishResult:h.publishResult,...hooks});}
async function oracle(h,params){const p=validateParams(params),table=await toneTable(p),out=new Uint8Array(h.domain.width*h.domain.height*3);for(let y=0;y<h.domain.height;y++)out.set(h.data.subarray(((y+h.domain.origin[1])*h.width+h.domain.origin[0])*3,((y+h.domain.origin[1])*h.width+h.domain.origin[0]+h.domain.width)*3),y*h.domain.width*3);
 for(const r of h.view.admittedRectangles()){
  const data=new Uint8Array(r.width*r.height*3);for(let y=0;y<r.height;y++)data.set(h.data.subarray(((r.y+y+h.domain.origin[1])*h.width+r.x+h.domain.origin[0])*3,((r.y+y+h.domain.origin[1])*h.width+r.x+h.domain.origin[0]+r.width)*3),y*r.width*3);
  const surface=createRgbSurface({byteLength:data.length,readInto:(target,offset)=>target.set(data.subarray(offset,offset+target.length))},{width:r.width,height:r.height,budget:h.budget,ownsStore:false}),codec=createRgbRecompression({surface},h.budget);
  try{await codec.visit(p.quality,{onBand:async(a,b,{y,rows})=>{const rendered=await fusedCpu(a,b,p,table);for(let row=0;row<rows;row++)out.set(rendered.subarray(row*r.width*3,(row+1)*r.width*3),((r.y+y+row)*h.domain.width+r.x)*3);}});}finally{await codec.dispose();await surface.dispose();}
 }return out;
}

const explicitJpeg={codec:'jpeg',lossless:false};
for(const shape of ['whole','hole','disjoint','slivers'])test('selected JPEG keeps the exact admitted-context oracle: '+shape,async()=>{
 const h=await fixture({shape});try{
  const p={quality:73,scale:17,contrast:43,linear:false,grayscale:true,recompression:explicitJpeg};
  const expected=await oracle(h,p),result=await call(h,p),actual=await read(h.records.at(-1).surface),scope=await read(h.records.at(-1).planeRecords.analysis_scope.surface);
  assert.deepEqual(actual,expected);assert.equal(result.provenance.codec.codec,'jpeg');assert.equal(result.provenance.jpegGrid,undefined);assert.equal(result.metrics.analysedPixels,h.domain.countIncluded);assert.equal(result.metrics.sourceRegionPolicy,'exact-native-recompression-fragment-contexts');
  for(let y=0;y<h.domain.height;y++)for(let x=0;x<h.domain.width;x++)assert.equal(scope[y*h.domain.width+x],+h.domain.contains(x,y));
 }finally{await h.cleanup();}
});
test('selected-context caching separates quality and reuses completed Original recompressions for rendering',async()=>{
 const h=await fixture();try{const a=await call(h,{quality:75,recompression:explicitJpeg}),b=await call(h,{quality:92,recompression:explicitJpeg}),aa=await call(h,{quality:75,scale:23,recompression:explicitJpeg});assert.equal(a.metrics.recompressedCache,false);assert.equal(b.metrics.recompressedCache,false);assert.equal(aa.metrics.recompressedCache,true);assert.equal(aa.metrics.recompressions,0);assert.equal(h.derived.sourceRegionRecompressionCache.entries.size,2);assert.equal(h.derived.sourceRegionRecompressionCache.pinned.size,0);}finally{await h.cleanup();}
});
test('excluded RGB cannot enter selected-context encodings or residuals',async()=>{
 const a=await fixture({shape:'disjoint'}),b=await fixture({shape:'disjoint',poison:true});try{await call(a,{quality:93,recompression:explicitJpeg});await call(b,{quality:93,recompression:explicitJpeg});const x=await read(a.records[0].surface),y=await read(b.records[0].surface);for(let yy=0;yy<a.domain.height;yy++)for(let xx=0;xx<a.domain.width;xx++)if(a.domain.contains(xx,yy)){const at=(yy*a.domain.width+xx)*3;assert.deepEqual(x.subarray(at,at+3),y.subarray(at,at+3));}assert.ok(a.science.length&&b.science.length);}finally{await a.cleanup();await b.cleanup();}
});
test('scoped selected-codec preview borrows completed native pixels without recompression',async()=>{
 const h=await fixture();try{const params={quality:75,scale:19,recompression:explicitJpeg};await call(h,params);const preview=await previewSourceRegionClassic({imageId:'test',params,side:16,original:h.original,derived:h.derived,view:h.view,domain:h.domain,budget:h.budget,codec:{id:'must-not-run',recompress(){throw Error('The completed native encoding must be reused.');}}});assert.equal(preview.nativePixelSamples,true);assert.equal(preview.metrics.nativeRecompressionReuse,true);assert.equal(preview.metrics.recompressions,0);assert.equal(preview.presentation.recompressionPlan.stage.codec,'jpeg');assert.equal(preview.presentation.codec.codec,'jpeg');assert.equal(h.derived.sourceRegionRecompressionCache.pinned.size,0);}finally{await h.cleanup();}
});
test('scoped uncached selected-codec preview preserves Original admission and has distinct quality identity',async()=>{
 const h=await fixture({shape:'disjoint'});try{const request=params=>previewSourceRegionClassic({imageId:'test',params,side:16,original:h.original,derived:h.derived,view:h.view,domain:h.domain,budget:h.budget,codec:{id:'must-not-run',recompress(){throw Error('Alternate previews must use the selected codec service.');}}});const p={quality:75,recompression:explicitJpeg},a=await request(p),aa=await request({...p,scale:33}),b=await request({...p,quality:93});assert.equal(a.nativePixelSamples,false);assert.ok(a.metrics.recompressions>0);assert.equal(aa.metrics.cacheHit,true);assert.equal(aa.metrics.recompressions,0);assert.equal(b.metrics.cacheHit,false);assert.ok(b.metrics.recompressions>0);assert.equal(h.derived.sourceRegionRecompressionCache,undefined);}finally{await h.cleanup();}
});
test('cancelled selected-codec context discards incomplete planes and releases pins before retry',async()=>{
 const h=await fixture();try{const controller=new AbortController();await assert.rejects(call(h,{recompression:explicitJpeg},{signal:controller.signal,onProgress:event=>{if(event.phase==='source-region-ela-recompression')controller.abort();}}),{code:'CANCELLED'});assert.equal(h.derived.sourceRegionRecompressionCache.entries.size,0);assert.equal(h.derived.sourceRegionRecompressionCache.pinned.size,0);assert.equal(h.records.length,0);await call(h,{recompression:explicitJpeg});assert.equal(h.derived.sourceRegionRecompressionCache.entries.size,1);}finally{await h.cleanup();}
});
test('selected-codec admission refuses before any scientific Original read',async()=>{
 const h=await fixture({budgetBytes:1024**2});try{await assert.rejects(call(h,{recompression:explicitJpeg}),{code:'MEMORY_LIMIT'});assert.equal(h.science.length,0);assert.equal(h.records.length,0);assert.equal(h.derived.sourceRegionRecompressionCache.entries.size,0);assert.equal(h.derived.sourceRegionRecompressionCache.pinned.size,0);}finally{await h.cleanup();}
});
