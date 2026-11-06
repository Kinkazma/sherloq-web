import {compileNativeSourceRegionMembership} from './source-region-native-regions.js';
import {requireValue,checkAbort,checkpoint} from './errors.js';

const validPolygon=polygon=>Array.isArray(polygon)&&polygon.length>=3&&polygon.every(point=>Array.isArray(point)&&point.length===2&&point.every(Number.isFinite));
const bounds=polygon=>polygon.reduce((box,[x,y])=>[Math.min(box[0],x),Math.min(box[1],y),Math.max(box[2],x),Math.max(box[3],y)],[Infinity,Infinity,-Infinity,-Infinity]);
const indexed=polygon=>({polygon,bounds:bounds(polygon)});
function contains({polygon,bounds:[left,top,right,bottom]},x,y){
 if(x<left||x>right||y<top||y>bottom)return false;
 let inside=false;
 for(let i=0,j=polygon.length-1;i<polygon.length;j=i++){
  const [ax,ay]=polygon[j],[bx,by]=polygon[i],cross=(x-ax)*(by-ay)-(y-ay)*(bx-ax);
  // Boundary points in a text exclusion must not enter a match.
  if(Math.abs(cross)<=1e-9&&x>=Math.min(ax,bx)&&x<=Math.max(ax,bx)&&y>=Math.min(ay,by)&&y<=Math.max(ay,by))return true;
  if((ay>y)!==(by>y)&&x<(bx-ax)*(y-ay)/(by-ay)+ax)inside=!inside;
 }
 return inside;
}

/** No default scope is synthesized. Empty acquisition regions deliberately
 * admit no features instead of falling back to the complete image. */
export function compileForgeryscopeScientificScope(scope,{width,height,sourceSha256}={}){
 if(scope===undefined)return null;
 requireValue(scope?.schema==='sherloq.scientific-scope/1'&&scope.coordinates==='original-pixels','Invalid Forgeryscope scientific scope version or coordinates.');
 requireValue(scope.width===width&&scope.height===height&&[width,height].every(value=>Number.isSafeInteger(value)&&value>0),'Scientific scope dimensions differ from the original.');
 requireValue(typeof scope.sourceSha256==='string'&&/^[a-f0-9]{64}$/.test(scope.sourceSha256)&&scope.sourceSha256===sourceSha256,'Scientific scope source identity differs from the original.');
 requireValue(typeof scope.fingerprint==='string'&&scope.fingerprint.length>0&&Array.isArray(scope.regions)&&Array.isArray(scope.excluded),'Scientific scope identity and polygons are required.');
 const regions=scope.regions.map(region=>{
  requireValue(region&&[region.x0,region.y0,region.x1,region.y1].every(Number.isFinite)&&region.x1>region.x0&&region.y1>region.y0,'Invalid scientific acquisition rectangle.');
  const polygon=region.polygon??[[region.x0,region.y0],[region.x1,region.y0],[region.x1,region.y1],[region.x0,region.y1]];
  requireValue(validPolygon(polygon),'Invalid scientific acquisition polygon.');return indexed(polygon);
 });
 requireValue(scope.excluded.every(validPolygon),'Invalid scientific exclusion polygon.');const excluded=scope.excluded.map(indexed);
 const native=compileNativeSourceRegionMembership(scope.nativeSourceRegions,{width,height,sourceSha256});
 return {schema:scope.schema,fingerprint:scope.fingerprint,width,height,sourceSha256:scope.sourceSha256,regions,excluded,
  admits(x,y){return Number.isFinite(x)&&Number.isFinite(y)&&(!native||native.admits(x,y))&&regions.some(region=>contains(region,x,y))&&!excluded.some(region=>contains(region,x,y));}};
}

/** Feature tensors are owned by one extraction, not shared cached arrays.
 * Compact them in place, retaining the original allocation and its lease.
 * This removes descriptor rows before LightGlue/RANSAC without painting source
 * pixels or allocating another dense image/mask. */
export async function filterForgeryscopeFeatures(features,image,scope,{transform='original',signal}={}){
 if(!scope)return features;
 requireValue(['original','fliplr','flipud','rot180'].includes(transform),'Invalid scoped feature transform.');
 const count=features.keypoints?.dims?.[1],origin=image.scientificOrigin??[0,0];
 requireValue(Number.isSafeInteger(count)&&count>=0&&features.keypoints.data instanceof Float32Array&&features.keypoints.data.length===count*2&&origin.length===2&&origin.every(Number.isFinite),'Invalid scoped keypoints or crop origin.');
 const fields=['keypoints','descriptors','keypoint_scores','scales','oris'].flatMap(name=>{
  const value=features[name];if(value===undefined)return [];
  requireValue(value.data instanceof Float32Array&&value.dims?.[0]===1&&value.dims[1]===count&&(count===0||value.data.length%count===0),'Invalid scoped feature tensor.');
  return [{name,value,stride:count?value.data.length/count:value.dims.slice(2).reduce((a,b)=>a*b,1)}];
 });
 let kept=0;
 for(let i=0;i<count;i++){
  if(i%256===0)await checkpoint(signal);
  let x=features.keypoints.data[i*2],y=features.keypoints.data[i*2+1];
  if(transform==='fliplr'||transform==='rot180')x=image.width-1-x;
  if(transform==='flipud'||transform==='rot180')y=image.height-1-y;
  if(!scope.admits(x+origin[0],y+origin[1]))continue;
  if(kept!==i)for(const {value,stride}of fields)value.data.copyWithin(kept*stride,i*stride,(i+1)*stride);
  kept++;
 }
 checkAbort(signal);
 for(const {name,value,stride}of fields)features[name]={...value,data:value.data.subarray(0,kept*stride),dims:value.dims.map((n,i)=>i===1?kept:n)};
 features.scopeFiltering={schema:scope.schema,fingerprint:scope.fingerprint,coordinates:'original-pixels',stage:'keypoints-before-matching',original:count,retained:kept,excluded:count-kept,cropOrigin:[...origin],transform,policy:'feature-center; original pixels and native extraction settings preserved'};
 return features;
}
