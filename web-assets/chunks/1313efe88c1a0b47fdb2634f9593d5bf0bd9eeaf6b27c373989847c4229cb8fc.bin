import {requireValue,checkAbort,controlCheckpoint} from './errors.js';

// clone_detectors.boxes_for: pixel-centre rectangles -> clipped half-open boxes.
// Preserve fractional float64 coordinates until floor(min) / ceil(max)+1.
export function automaticAiBoxes(width,height,regions){
 requireValue([width,height].every(x=>Number.isSafeInteger(x)&&x>0&&x<=2**30)&&Array.isArray(regions),'AI source dimensions and selection required');
 const boxes=[];
 for(const p of regions){
  requireValue(Array.isArray(p)&&p.length===4&&p.every(xy=>Array.isArray(xy)&&xy.length===2&&xy.every(Number.isFinite)),'AI detectors require four rectangle corners');
  const xs=p.map(xy=>xy[0]),ys=p.map(xy=>xy[1]),left=Math.min(...xs),right=Math.max(...xs),top=Math.min(...ys),bottom=Math.max(...ys);
  const corners=new Set(p.map(xy=>JSON.stringify(xy))),expected=new Set([[left,top],[right,top],[left,bottom],[right,bottom]].map(xy=>JSON.stringify(xy)));
  requireValue(corners.size===expected.size&&[...corners].every(key=>expected.has(key)),'AI regions must be axis-aligned rectangles');
  const box=[Math.max(0,Math.floor(left)),Math.max(0,Math.floor(top)),Math.min(width,Math.ceil(right)+1),Math.min(height,Math.ceil(bottom)+1)];
  requireValue(box[2]-box[0]>=8&&box[3]-box[1]>=8,'Each AI region must measure at least 8 by 8 pixels');boxes.push(box);
 }
 return boxes.length?boxes:[[0,0,width,height]];
}
export function automaticAiSelection(width,height,params){
 requireValue(params&&Array.isArray(params.regions)&&Array.isArray(params.excluded)&&params.compare===false,'Independent native AI selection required');
 requireValue(!params.selection_present||params.regions.length>0,'No active AI region');
 return {boxes:automaticAiBoxes(width,height,params.regions),excluded:params.excluded.length?automaticAiBoxes(width,height,params.excluded):[]};
}
export function localAiExclusions(box,excluded){
 const [x,y,r,b]=box;return excluded.filter(([a,c,d,e])=>Math.min(d,r)>Math.max(a,x)&&Math.min(e,b)>Math.max(c,y)).map(([a,c,d,e])=>[Math.max(a,x)-x,Math.max(c,y)-y,Math.min(d,r)-x,Math.min(e,b)-y]);
}
/** Prepare the existing D2PRL adapter contract without reading or masking RGB. */
export function automaticD2prlRequest(plan,{id,imageId}={}){
 const job=plan.jobs.find(j=>j.id==='d2prl');requireValue(job&&typeof id==='string'&&typeof imageId==='string','D2PRL job and request identity required');if(!job.enabled)return null;
 const {boxes,excluded}=automaticAiSelection(plan.width,plan.height,job.params);
 return {id,imageId,operation:'ai.clones.d2prl',backend:plan.cpu?'cpu':'auto',params:{minimum:job.minimum,exclusions:excluded,selectionPresent:true},regions:boxes.map((bounds,index)=>({id:'automatic-zone-'+index,kind:'region',bounds}))};
}
/** Returns an owned crop: exclusions are blackened ONLY for Forgeryscope. */
export async function readAutomaticForgeryscopeCrop(image,box,excluded,{budget,signal}={}){
 const [x,y,r,b]=box,width=r-x,height=b-y;let owned;
 await controlCheckpoint(signal);
 if(image.surface)owned=await image.surface.readWindow({x,y,width,height},{signal});
 else{
  const source=image.pixels??image;requireValue(source?.data instanceof Uint8Array&&source.data.length===source.width*source.height*3&&x>=0&&y>=0&&r<=source.width&&b<=source.height&&width>0&&height>0,'RGB8 source crop required');
  const release=budget.reserve(width*height*3);
  try{const data=new Uint8Array(width*height*3);for(let row=0;row<height;row++){if(row%64===0)await controlCheckpoint(signal);data.set(source.data.subarray(((y+row)*source.width+x)*3,((y+row)*source.width+r)*3),row*width*3);}owned={pixels:{width,height,format:'rgb8',data},release};}catch(error){release();throw error;}
 }
 try{
  requireValue(owned.pixels.format==='rgb8'&&owned.pixels.data instanceof Uint8Array,'RGB8 crop required');
  const exclusions=localAiExclusions(box,excluded);
  for(const [a,c,d,e] of exclusions)for(let row=c;row<e;row++){if(row%64===0)await controlCheckpoint(signal);owned.pixels.data.fill(0,(row*width+a)*3,(row*width+d)*3);}
  checkAbort(signal);return {...owned,origin:[x,y],exclusions};
 }catch(error){owned.release();throw error;}
}
