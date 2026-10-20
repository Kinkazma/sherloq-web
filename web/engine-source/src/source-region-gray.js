import {compileOriginalSourceRegions} from './source-region-geometry.js';
import {EngineError,requireValue,checkAbort} from './errors.js';

/** Crop the maintained file-gray decoder, never gray() of a decoded RGB crop.
 * Its caller computes reductions only after this native rectangle is applied. */
export async function createSourceRegionGray(image,createOriginal,{signal}={}){
 checkAbort(signal);const original=image.originalSource;
 requireValue(original&&typeof createOriginal==='function','An original file-gray owner is required.');
 const domain=await compileOriginalSourceRegions(image.sourceRegionDomain),grid=image.surface.descriptor,parentGrid=original.surface.descriptor;
 if(domain.empty||domain.countIncluded!==domain.width*domain.height)throw new EngineError('SOURCE_SCOPE_UNSUPPORTED','File-gray analysis requires a completely admitted native rectangle.');
 requireValue(domain.sourceSha256===original.sha256&&domain.sourceWidth===parentGrid.width&&domain.sourceHeight===parentGrid.height&&grid.width===domain.width&&grid.height===domain.height&&domain.origin.every((v,i)=>v===image.sourceRegionOrigin?.[i]),'The file-gray crop differs from its original source domain.');
 checkAbort(signal);let parent;
 try{
  parent=await createOriginal(original);checkAbort(signal);if(!parent)return null;
  requireValue(parent.descriptor.width===parentGrid.width&&parent.descriptor.height===parentGrid.height,'The original file-gray grid differs from its RGB grid.');
  let disposed=false;const pending=new Set();
  const surface={descriptor:{...parent.descriptor,id:'source-region-gray-'+parent.descriptor.id,width:domain.width,height:domain.height},
   async readWindow(rect={x:0,y:0,width:domain.width,height:domain.height},hooks={}){
    checkAbort(hooks.signal);if(disposed)throw new EngineError('DISPOSED','The native file-gray crop is closed.');
    requireValue(rect&&[rect.x,rect.y,rect.width,rect.height].every(Number.isSafeInteger)&&rect.x>=0&&rect.y>=0&&rect.width>0&&rect.height>0&&rect.x+rect.width<=domain.width&&rect.y+rect.height<=domain.height,'File-gray read is outside its admitted native rectangle.');
    const work=parent.readWindow({...rect,x:rect.x+domain.origin[0],y:rect.y+domain.origin[1]},hooks);pending.add(work);
    try{const part=await work;try{checkAbort(hooks.signal);return{...part,surfaceId:surface.descriptor.id,revision:surface.descriptor.revision,origin:[rect.x,rect.y]};}catch(error){part.release();throw error;}}finally{pending.delete(work);}
   },
   async dispose(){if(disposed)return;disposed=true;await Promise.allSettled([...pending]);await parent.dispose();}
  };
  return surface;
 }catch(error){await parent?.dispose();throw error;}
}
