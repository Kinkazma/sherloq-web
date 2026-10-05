// Public LightGlueOverlap geometry. Affine estimation itself runs OpenCV 4.11
// RANSAC/USAC_MAGSAC in WASM; these functions preserve its source coordinates.
import {requireValue,checkpoint,checkAbort} from './errors.js';
const f=Math.fround;
const close=poly=>poly.length?[...poly.map(p=>[...p]),[...poly[0]]]:[];
const open=poly=>poly.length>1&&poly[0][0]===poly.at(-1)[0]&&poly[0][1]===poly.at(-1)[1]?poly.slice(0,-1):poly;
const area=poly=>Math.abs(poly.reduce((s,p,i)=>{const q=poly[(i+1)%poly.length];return s+p[0]*q[1]-q[0]*p[1];},0))/2;
export const polygonBounds=poly=>[Math.min(...poly.map(p=>p[0])),Math.min(...poly.map(p=>p[1])),Math.max(...poly.map(p=>p[0])),Math.max(...poly.map(p=>p[1]))];
function clip(poly,axis,bound,sign){
  const result=[];
  for(let i=0;i<poly.length;i++){
    const a=poly[i],b=poly[(i+1)%poly.length],insideA=sign*(a[axis]-bound)>=0,insideB=sign*(b[axis]-bound)>=0;
    if(insideA)result.push(a);
    if(insideA!==insideB){const t=(bound-a[axis])/(b[axis]-a[axis]),p=[a[0]+t*(b[0]-a[0]),a[1]+t*(b[1]-a[1])];p[axis]=bound;result.push(p);}
  }
  return result;
}
export function forgeryscopeFloatSum(values){
  function sum(start,n){
    if(n<8){let s=-0;for(let i=0;i<n;i++)s=f(s+values[start+i]);return s;}
    if(n<=128){const r=Array.from(values.slice(start,start+8));let i=8;for(;i<n-n%8;i+=8)for(let j=0;j<8;j++)r[j]=f(r[j]+values[start+i+j]);let s=f(f(f(r[0]+r[1])+f(r[2]+r[3]))+f(f(r[4]+r[5])+f(r[6]+r[7])));for(;i<n;i++)s=f(s+values[start+i]);return s;}
    let cut=Math.floor(n/2);cut-=cut%8;return f(sum(start,cut)+sum(start+cut,n-cut));
  }
  return sum(0,values.length);
}
function numpyFloatMean(values){return values.length?f(forgeryscopeFloatSum(values)/values.length):NaN;}
export function overlapFromAffine(matrix,inlierMask,scores,size0,size1,transform='original'){
  requireValue(matrix.length===6&&[...matrix].every(Number.isFinite)&&scores.length===inlierMask.length,'Invalid affine match.');
  requireValue(['original','fliplr','flipud','rot180'].includes(transform),'Invalid image transform.');
  const [w0,h0]=size0,[w1,h1]=size1;
  let poly=[[0,0],[w1,0],[w1,h1],[0,h1]].map(([x,y])=>[f(matrix[0]*x+matrix[1]*y+matrix[2]),f(matrix[3]*x+matrix[4]*y+matrix[5])]);
  poly=clip(clip(clip(clip(poly,0,0,1),0,w0,-1),1,0,1),1,h0,-1);
  if(poly.length<3||area(poly)===0)return {error:'No overlap found'};
  const sx=['fliplr','rot180'].includes(transform)?-1:1,sy=['flipud','rot180'].includes(transform)?-1:1;
  const tx=sx===-1?w1:0,ty=sy===-1?h1:0;
  const [a,b,c,d,e,g]=matrix;
  const H=[a*sx,b*sy,a*tx+b*ty+c,d*sx,e*sy,d*tx+e*ty+g,0,0,1];
  const det=H[0]*H[4]-H[1]*H[3];
  if(!det)return {error:'Affine transformation computation failed'};
  const inverse=[H[4]/det,-H[1]/det,(H[1]*H[5]-H[4]*H[2])/det,-H[3]/det,H[0]/det,(H[3]*H[2]-H[0]*H[5])/det];
  const poly1=poly.map(([x,y])=>{x=f(x);y=f(y);return [f(inverse[0]*x+inverse[1]*y+inverse[2]),f(inverse[3]*x+inverse[4]*y+inverse[5])];});
  const sorted=Array.from(scores).sort((a,b)=>a-b),middle=Math.floor(sorted.length/2),inliers=Array.from(scores).filter((_,i)=>inlierMask[i]);
  return {H,H_transformed:[...matrix,0,0,1],transform_type:transform,inliers:inliers.length,total_matches:scores.length,
    mean_match_score:numpyFloatMean(scores),median_match_score:sorted.length%2?sorted[middle]:f(f(sorted[middle-1]+sorted[middle])/2),
    min_match_score:sorted[0],inlier_mean_score:numpyFloatMean(inliers),match_scores:new Float32Array(scores),
    overlap_poly_img0:close(poly),overlap_poly_img1:close(poly1),bbox_img0:polygonBounds(poly),bbox_img1:polygonBounds(poly1),
    overlap_area_img0:area(poly),overlap_area_img1:area(poly1),percent_img0:100*area(poly)/(w0*h0),percent_img1:100*area(poly1)/(w1*h1)};
}
export function duplicateEvidence(match,panel0,panel1,id0,id1){
  const label=panel0[0],b0=panel0.slice(-4),b1=panel1.slice(-4);
  let polys,cropBounds;
  if(match.error){
    if(label!=='Blots')return null;
    polys=[b0,b1].map(([x,y,r,b])=>[[r,y],[r,b],[x,b],[x,y],[r,y]]);
    cropBounds=[b0,b1].map(([x,y,r,b])=>[0,0,r-x,b-y]);
    match={fallback:'full_bbox',inliers:0,total_matches:0,mean_match_score:0};
  }else{
    polys=[match.overlap_poly_img0,match.overlap_poly_img1].map((p,i)=>p.map(([x,y])=>[x+[b0,b1][i][0],y+[b0,b1][i][1]]));
    cropBounds=[match.overlap_poly_img0,match.overlap_poly_img1].map(p=>polygonBounds(p).map(Math.trunc));
  }
  return {panel_id0:id0,panel_id1:id1,panel_label:label,poly_coords0:polys[0],poly_coords1:polys[1],bbox_crop0:cropBounds[0],bbox_crop1:cropBounds[1],match_result:match,to_bbox:label==='Blots'};
}
// skimage.draw.polygon includes pixel centers on the polygon boundary. Keep
// fractional vertices through this step; bbox mode instead truncates bounds.
function contains(poly,x,y){
  let inside=false;
  for(let i=0,j=poly.length-1;i<poly.length;j=i++){
    const [ax,ay]=poly[j],[bx,by]=poly[i];
    const cross=(x-ax)*(by-ay)-(y-ay)*(bx-ax);
    if(Math.abs(cross)<1e-12&&x>=Math.min(ax,bx)&&x<=Math.max(ax,bx)&&y>=Math.min(ay,by)&&y<=Math.max(ay,by))return true;
    if((ay>y)!==(by>y)&&x<(bx-ax)*(y-ay)/(by-ay)+ax)inside=!inside;
  }
  return inside;
}
export async function writeDuplicateUnion(target,width,height,info,{signal}={}){
  requireValue(target instanceof Uint8Array&&target.length===width*height,'Invalid evidence mask.');
  for(const polygon of [info.poly_coords0,info.poly_coords1]){
    const poly=open(polygon),bounds=polygonBounds(poly);
    const [x0,y0,x1,y1]=info.to_bbox?bounds.map(Math.trunc):bounds;
    const xmin=Math.max(0,Math.ceil(x0)),ymin=Math.max(0,Math.ceil(y0)),xmax=Math.min(width-1,info.to_bbox?x1-1:Math.floor(x1)),ymax=Math.min(height-1,info.to_bbox?y1-1:Math.floor(y1));
    for(let y=ymin;y<=ymax;y++){
      if((y-ymin)%64===0)await checkpoint(signal);
      for(let x=xmin;x<=xmax;x++)if(info.to_bbox||contains(poly,x,y))target[y*width+x]=1;
    }
  }
  checkAbort(signal);return target;
}
