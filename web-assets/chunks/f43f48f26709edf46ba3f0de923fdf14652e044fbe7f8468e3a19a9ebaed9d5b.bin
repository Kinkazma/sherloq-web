import "../../runtime-context.js?v=0.30.0";
import {requireValue,checkAbort,controlCheckpoint,createCooperator} from './errors.js';
import {SELFDM_PROPOSAL_CRF_SCOPE_POLICY} from './selfdm-proposal-crf-scoped-graph.js';

export const SELFDM_PROPOSAL_SCOPE_POLICY='selfdm-proposal-native-domain-v1';
const isPoint=(scope,rect,width,height,x,y,admission)=>scope.admitsResizedPoint(x,y,rect,width,height)&&(!admission||admission.admits(x,y));
async function binaryGridSha256(values,{budget,signal}={}){
 const direct=values instanceof Uint8Array,release=direct?null:budget.reserve(values.length);
 try{checkAbort(signal);const bytes=direct?values:Uint8Array.from(values),digest=await crypto.subtle.digest('SHA-256',bytes);checkAbort(signal);return [...new Uint8Array(digest)].map(v=>v.toString(16).padStart(2,'0')).join('');}
 finally{release?.();}
}

/** SuperPoint postprocessing samples four normalized stride8 descriptor cells.
 * Their native Voronoi surfaces must all be admitted, not just the keypoint's
 * pixel centre. One small coarse bitmap is shared by NMS and point compaction.
 */
export async function createProposalPointAdmission(scope,rect,width,height,{budget,signal}={}){
 const cols=Math.floor(width/8),rows=Math.floor(height/8),release=budget.reserve(cols*rows);let complete=false;
 try{
  const values=new Uint8Array(cols*rows);let admitted=0;const cooperate=createCooperator(signal);
  for(let y=0;y<rows;y++){await cooperate();for(let x=0;x<cols;x++){
   const cell=[x*8,y*8,x===cols-1?width-1:x*8+7,y===rows-1?height-1:y*8+7];
   if(scope.admitsResizedRectangle(cell,rect,width,height)){values[y*cols+x]=1;admitted++;}
  }}
  const samples=(position,count)=>{const p=(position-3.5)*(count-1)/(count*8-4.5),first=Math.floor(p);return p-first>0?[first,first+1]:[first];};
  const gridSha256=await binaryGridSha256(values,{budget,signal});
  checkAbort(signal);complete=true;return {metadata:{stage:'bilinear-descriptor-support-before-NMS-TopK-and-SuperGlue',admittedCells:admitted,excludedCells:values.length-admitted,totalCells:values.length,nativeStride:8,nativeCentre:3.5,gridSha256,grid:[rows,cols],gridDtype:'uint8',gridMeaning:'row-major native descriptor cells; 1 admitted, 0 refused',rectangle:[...rect],resize:[height,width],coordinates:'original-image-pixels'},admits(x,y){return samples(x,cols).every(sx=>samples(y,rows).every(sy=>sx>=0&&sy>=0&&sx<cols&&sy<rows&&values[sy*cols+sx]===1));},release};
 }finally{if(!complete)release();}
}

/** The dense score grid is owned by its checkpoint. Suppress excluded scores
 * before native global NMS/TopK so labels cannot occupy the2048point budget or
 * suppress an adjacent acquisition. Original descriptors/RGB remain unchanged.
 */
export async function restrictProposalDenseScores(scores,{scope,rect,width,height,denseWidth,denseHeight,signal,admission}={}){
 requireValue(scope&&Array.isArray(rect)&&scores instanceof Float32Array&&scores.length===denseWidth*denseHeight,'Scoped SuperPoint dense score grid required');
 let excluded=0,admitted=0;
 for(let y=0;y<denseHeight;y++){
  if((y&31)===0)await controlCheckpoint(signal);
  for(let x=0;x<denseWidth;x++){if(isPoint(scope,rect,width,height,x,y,admission))admitted++;else{scores[y*denseWidth+x]=0;excluded++;}}
 }
 checkAbort(signal);return {policy:SELFDM_PROPOSAL_SCOPE_POLICY,stage:'dense-scores-before-native-NMS-and-TopK',admitted,excluded,total:scores.length};
}

/** An additional exact-coordinate check compacts native outputs before any
 * SuperGlue attention, Sinkhorn or matching score. Descriptors are channel
 * major [1,256,count], unlike ordinary row-major feature collections.
 */
export async function restrictProposalPoints(points,{scope,rect,width,height,signal,admission}={}){
 const {keypoints,scores,descriptors,count}=points;
 requireValue(scope&&Number.isSafeInteger(count)&&count>=0&&keypoints instanceof Float32Array&&keypoints.length===count*2&&scores instanceof Float32Array&&scores.length===count&&descriptors instanceof Float32Array&&descriptors.length===count*256,'Native scoped SuperPoint outputs required');
 const retained=[];
 for(let index=0;index<count;index++){
  if((index&255)===0)await controlCheckpoint(signal);
  const x=keypoints[index*2],y=keypoints[index*2+1];requireValue(Number.isFinite(x)&&Number.isFinite(y)&&x>=0&&y>=0&&x<width&&y<height,'Native proposal keypoint outside its rectangle');
  if(isPoint(scope,rect,width,height,x,y,admission))retained.push(index);
 }
 const kept=retained.length;
 if(kept!==count){
  for(let c=0;c<256;c++)for(let i=0;i<kept;i++)descriptors[c*kept+i]=descriptors[c*count+retained[i]];
  for(let i=0;i<kept;i++){const old=retained[i];keypoints[i*2]=keypoints[old*2];keypoints[i*2+1]=keypoints[old*2+1];scores[i]=scores[old];}
 }
 checkAbort(signal);return {...points,keypoints:keypoints.subarray(0,kept*2),scores:scores.subarray(0,kept),descriptors:descriptors.subarray(0,kept*256),count:kept,scopeFiltering:{policy:SELFDM_PROPOSAL_SCOPE_POLICY,stage:'points-before-SuperGlue-attention-and-matching',admitted:kept,excluded:count-kept,total:count}};
}

/** DeepMask masks use an affine160px support after112→160native resize.
 * Gate model-mask samples before candidate banks/ranking, so entirely excluded
 * proposals cannot occupy any of the native Top500 slots. CNN objectness values
 * on retained candidates remain learned/native; no synthetic confidence.
 */
export async function restrictProposalMask(mask,{scope,width,height,scale,row,col,signal,cooperate=createCooperator(signal)}={}){
 requireValue(scope&&mask instanceof Float32Array&&mask.length===112**2&&Number.isFinite(scale)&&scale>0&&Number.isSafeInteger(row)&&Number.isSafeInteger(col),'Native scoped DeepMask support required');
 const ax=(width-1)/(width*scale),ay=(height-1)/(height*scale),tx=-ax*(80-16*col),ty=-ay*(80-16*row);let active=0,excluded=0;
 const support=[Math.max(0,tx-ax),Math.max(0,ty-ay),Math.min(width-1,tx+ax*161),Math.min(height-1,ty+ay*161)];
 if(support[0]>support[2]||support[1]>support[3]){mask.fill(0);return {admitted:0,excluded:mask.length,total:mask.length};}
 if(scope.admitsSourceRectangle(support)){for(const v of mask)if(v>.2)active++;checkAbort(signal);return {admitted:active,excluded:0,total:mask.length};}
 for(let y=0;y<112;y++){
  if((y&31)===0)await cooperate();
  const oy=ty+ay*((y+.5)*160/112-.5);
  for(let x=0;x<112;x++){
   const ox=tx+ax*((x+.5)*160/112-.5),i=y*112+x;
   const halfX=ax*160/112/2,halfY=ay*160/112/2,rect=[Math.max(0,ox-halfX),Math.max(0,oy-halfY),Math.min(width-1,ox+halfX),Math.min(height-1,oy+halfY)];
   if(rect[0]>rect[2]||rect[1]>rect[3]||!scope.admitsSourceRectangle(rect)){mask[i]=0;excluded++;}else if(mask[i]>.2)active++;
  }
 }
 checkAbort(signal);return {admitted:active,excluded,total:mask.length};
}

export function proposalScopedMean(rect,score,width,scope){
 let sum=0,count=0;
 for(let y=rect[1];y<rect[3];y++)for(let x=rect[0];x<rect[2];x++)if(scope.admitsSourcePoint(x,y)){sum+=score[y*width+x];count++;}
 return count?Math.fround(sum/count):0;
}

export async function createProposalCRFScientificScope(scope,window,{budget,signal}={}){
 const {width,height,sx,sy}=window,rows=Math.ceil(height/4),columns=Math.ceil(width/4),p0=Math.ceil(((4-height%4)%4)/2),p1=Math.ceil(((4-width%4)%4)/2),release=budget.reserve((width*height+rows*columns)*4);let complete=false;
 try{
  const output=new Float32Array(width*height),coarse=new Float32Array(rows*columns);let admittedPixels=0,admittedCells=0;
  for(let y=0;y<height;y++){if((y&31)===0)await controlCheckpoint(signal);for(let x=0;x<width;x++)if(scope.admitsSourcePoint(sx+x,sy+y)){output[y*width+x]=1;admittedPixels++;}}
  for(let y=0;y<rows;y++)for(let x=0;x<columns;x++){
   const x0=Math.max(0,x*4-p1),y0=Math.max(0,y*4-p0),x1=Math.min(width,(x+1)*4-p1)-1,y1=Math.min(height,(y+1)*4-p0)-1;
   if(scope.admitsSourceRectangle([sx+x0,sy+y0,sx+x1,sy+y1])){coarse[y*columns+x]=1;admittedCells++;}
  }
  const gridSha256=await binaryGridSha256(coarse,{budget,signal}),outputScopeSha256=await binaryGridSha256(output,{budget,signal});
  checkAbort(signal);complete=true;return {inputs:{scientific_scope_coarse:{data:coarse,dims:[1,1,rows,columns]},scientific_scope_output:{data:output,dims:[1,height,width]}},metadata:{policy:SELFDM_PROPOSAL_CRF_SCOPE_POLICY,stage:'source-and-target-adjacency-before-unary-message-multiplication',window:{...window},admittedPixels,excludedPixels:width*height-admittedPixels,admittedCells,excludedCells:rows*columns-admittedCells,totalCells:rows*columns,gridSha256,coarseShape:[rows,columns],outputScopeSha256,outputShape:[height,width],gridDtype:'uint8',gridMeaning:'row-major binary native input domain; 1 admitted, 0 refused',normalization:'Retained adjacency mass rescaled to native adjacency mass; original appearance context preserved'},release};
 }finally{if(!complete)release();}
}
