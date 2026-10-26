import {detectedRectangles} from './sparse-controls.js';
import {EngineError} from './unified-engine/src/errors.js';

// Reuse the native geometric detector. These are editable panel proposals,
// neither scientific classification nor evidence of a clone.
export async function detectIndividualSubimages(client,{width,height,sourceSha256,neural=false,maxRegions=100}={}){
 if(!Number.isSafeInteger(width)||!Number.isSafeInteger(height)||width<=0||height<=0)throw new EngineError('INVALID_INPUT','Original image dimensions are required for subimage selection.');
 if(!Number.isSafeInteger(maxRegions)||maxRegions<1||maxRegions>8192)throw new EngineError('INVALID_INPUT','Invalid geometric proposal metadata limit.');
 const data=await client.detectSubimages();
 if(!data||!Array.isArray(data.regions)||data.regions.length>maxRegions)throw new EngineError('INVALID_INPUT','Invalid subimage detector regions.');
 if(data.boundsConvention&&data.boundsConvention!=='half-open')throw new EngineError('INVALID_INPUT','Subimage detector bounds must be half-open.');
 const ids=new Set();
 for(const region of data.regions){
  const b=region?.bounds;
  if(!Array.isArray(b)||b.length!==4||!b.every(Number.isSafeInteger)||b[0]<0||b[1]<0||b[2]>width||b[3]>height||b[0]>=b[2]||b[1]>=b[3])throw new EngineError('INVALID_INPUT','Subimage detector bounds must use original image pixels.');
  if(region.id!==undefined&&(typeof region.id!=='string'||!region.id||ids.has(region.id)))throw new EngineError('INVALID_INPUT','Subimage detector region IDs must be unique.');
  if(region.id)ids.add(region.id);
 }
 if(data.polygons!==undefined&&(!Array.isArray(data.polygons)||data.polygons.length!==data.regions.length))throw new EngineError('INVALID_INPUT','Invalid subimage detector polygons.');
 if(data.polygons)for(const [i,polygon]of data.polygons.entries()){
  const [x0,y0,x1,y1]=data.regions[i].bounds;
  if(!Array.isArray(polygon)||polygon.length<3||!polygon.every(p=>Array.isArray(p)&&p.length===2&&p.every(Number.isFinite)&&p[0]>=x0&&p[0]<x1&&p[1]>=y0&&p[1]<y1))throw new EngineError('INVALID_INPUT','Subimage detector polygons must remain inside their original pixel bounds.');
 }
 // An envelope permits cross-panel matching in sparse tools. Independent
 // neural inference must receive ONLY the detected panels, never that envelope.
 const rectangles=neural?data.regions.map((r,i)=>({id:r.id||'panel-'+i,x0:r.bounds[0],y0:r.bounds[1],x1:r.bounds[2],y1:r.bounds[3],...(data.polygons?.[i]?{polygon:structuredClone(data.polygons[i])}:{})})):detectedRectangles(data);
 if(neural)for(const rectangle of rectangles)rectangle.detection={operation:'subimages.detect',coordinates:'original-pixels',boundsConvention:'half-open',width,height,sourceSha256,...{bounds:[rectangle.x0,rectangle.y0,rectangle.x1,rectangle.y1]},semantics:'Geometric panel proposal; independent neural inference, no cross-panel comparison.'};
 return rectangles;
}

export function individualSubimageProvenance(rectangles,{width,height,sourceSha256}={}){
 const proposals=rectangles.filter(r=>r.detection?.operation==='subimages.detect'&&r.detection.width===width&&r.detection.height===height&&r.detection.sourceSha256===sourceSha256);
 if(!proposals.length)return null;
 return {operation:'subimages.detect',sourceSha256,width,height,coordinates:'original-pixels',boundsConvention:'half-open',proposals:proposals.map(r=>({id:r.id,bounds:[r.x0,r.y0,r.x1,r.y1]})),semantics:'Geometric panel proposals, editable by the user; independent neural inference does not compare panels with one another.'};
}
