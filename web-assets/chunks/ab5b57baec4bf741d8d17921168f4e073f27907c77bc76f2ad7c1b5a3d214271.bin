import "../../runtime-context.js?v=0.33.2";
import {requireValue} from './errors.js';
import {allocateTypedArray} from './allocation.js';
import {createRgbSurface} from './rgb-surface.js';
import {createPcaResultTables} from './pca-result-tables.js';
import {retireCompositeOwners} from './composite-owner-release.js';
// Add independent Core handles to the unchanged fresh8 payload. The RGB output
// has independent backing when the legacy result exposes a transferable pixel
// buffer. Existing segmented stores already own their backing and stay unchanged.
// Cloud/model tables likewise survive public transfer or caller mutation.
export async function createPcaCompatibilityResult(result,{surface,budget,onOwner}={}){
 let tables,credit,backing,pixels,modelCredit,model;const record={get surface(){return surface;},get tableRecords(){return tables?.tableRecords;},dispose(){return retireCompositeOwners([()=>surface?.dispose(),()=>tables?.dispose(),()=>{model=null;modelCredit?.();modelCredit=null;},()=>{if(!surface){pixels=null;if(backing){const bytes=backing();backing=null;if(bytes!==0)budget.notifyBackingRelease?.('array-buffer',bytes);}credit?.();credit=null;}}],{requireAck:true});}};
 requireValue(typeof onOwner==='function'&&result?.data?.channelOrder==='BGR'&&result.data.cloud?.rgb instanceof Uint8Array,'Complete fresh PCA8 data is required.');const adopted=onOwner(record);requireValue(adopted!==false&&adopted!==0&&!(adopted&&typeof adopted.then==='function'),'PCA compatibility adoption must be synchronous.');
 try{
  if(!surface){const p=result.pixels;requireValue(p?.format==='rgb8'&&p.data instanceof Uint8Array&&p.data.length===p.width*p.height*3,'PCA compatibility RGB output differs.');credit=budget.reserve(p.data.byteLength);pixels=allocateTypedArray(Uint8Array,p.data.length,{label:'private-pca8-final'});pixels.set(p.data);backing=budget.registerBacking?.('array-buffer',pixels.byteLength,{owner:'pca8-final',label:'private-final-rgb8',identity:pixels.buffer});const store={byteLength:pixels.byteLength,storage:'memory',async readInto(target,offset){requireValue(pixels&&offset>=0&&offset+target.length<=pixels.length,'PCA RGB result is closed.');target.set(pixels.subarray(offset,offset+target.length));},dispose(){pixels=null;if(backing){const bytes=backing();backing=null;if(bytes!==0)budget.notifyBackingRelease?.('array-buffer',bytes);}credit?.();credit=null;}};surface=createRgbSurface(store,{width:p.width,height:p.height,budget});}
  modelCredit=budget.reserve(120);model=new Float64Array(15);model.set(result.data.mean,0);model.set(result.data.eigenvectors,3);model.set(result.data.eigenvalues,12);
  createPcaResultTables(model,{data:result.data.cloud},{budget,copySample:true,onOwner:owner=>tables=owner});model=null;modelCredit();modelCredit=null;return record;
 }catch(primary){await retireCompositeOwners([()=>record.dispose()],{primary,requireAck:true});throw primary;}
}
