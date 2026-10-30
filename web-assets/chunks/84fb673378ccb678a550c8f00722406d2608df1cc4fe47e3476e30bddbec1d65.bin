// D2PRL native candidate transformations, separate from descriptor evaluation.
import{requireValue,checkAbort,controlCheckpoint,normalizeResourceError}from'../../src/errors.js';
const f=Math.fround;
function allocateFloats(count,allocation='d2prl-candidates'){
 try{return new Float32Array(count);}catch(error){throw normalizeResourceError(error,{requestedBytes:count*4,allocationKind:'array-buffer',allocation});}
}
// Eight periodic index vectors cost32*side bytes. The owning PatchMatch
// workspace separately funds512 bytes of geometry metadata. Partial allocation
// remains attached to that owner and is reused if an allocation is retried.
function completePeriodicGeometry(geometry,onAllocate=()=>{}){
 if(geometry.ready)return geometry;const {side,columns,rows}=geometry,shifts=[-2,-1,1,2];
 for(let j=0;j<4;j++)for(const vectors of[columns,rows])if(!vectors[j]){
  try{vectors[j]=new Int32Array(side);}catch(error){throw normalizeResourceError(error,{requestedBytes:side*4,allocationKind:'array-buffer',allocation:'d2prl-propagation-geometry'});}onAllocate(vectors[j].byteLength);
 }
 for(let i=0;i<side;i++)for(let j=0;j<4;j++){const at=(i-shifts[j]+side*2)%side;columns[j][i]=at;rows[j][i]=at*side;}
 geometry.ready=true;return geometry;
}
// One pair of useful candidate planes. A caller must finish consuming a pair
// before begin() reuses it. Partial growth remains owned across a failed retry;
// no allocation is made before an actual transformation needs that capacity.
export function createCandidateWorkspace(side){
 requireValue(Number.isInteger(side)&&side>=2&&side<=1792,'Unsupported D2PRL grid');
 const maximum=13*side*side,planes=[];let cursor=0,disposed=false,allocations=0,allocatedBytes=0,geometry,geometryAllocations=0,geometryAllocatedBytes=0;
 return{
  begin(){requireValue(!disposed,'Candidate workspace disposed');cursor=0;},
  allocate(count){
   requireValue(!disposed&&cursor<2&&Number.isInteger(count)&&count>=0&&count<=maximum,'Candidate workspace shape');
   const index=cursor++;let plane=planes[index];
   if(!plane||plane.length<count){plane=allocateFloats(count,'d2prl-candidate-workspace');planes[index]=plane;allocations++;allocatedBytes+=plane.byteLength;}
   return plane.length===count?plane:plane.subarray(0,count);
  },
  geometry(requestedSide=side){
   requireValue(!disposed&&requestedSide===side,'Candidate geometry owner or grid differs');
   geometry??={side,columns:[],rows:[],ready:false};return completePeriodicGeometry(geometry,bytes=>{geometryAllocations++;geometryAllocatedBytes+=bytes;allocatedBytes+=bytes;});
  },
  snapshot(){const geometryResidentBytes=geometry?[...geometry.columns,...geometry.rows].reduce((sum,vector)=>sum+(vector?.byteLength??0),0):0;return{allocations,allocatedBytes,residentBytes:planes.reduce((sum,plane)=>sum+plane.byteLength,0)+geometryResidentBytes,...(geometry||geometryAllocations?{geometry:{allocations:geometryAllocations,allocatedBytes:geometryAllocatedBytes,residentBytes:geometryResidentBytes,requiredCreditBytes:32*side+512,metadataAllowanceBytes:512,ready:geometry?.ready===true}}:{})};},
  dispose(){planes.length=0;geometry=null;disposed=true;}
 };
}
function setup(side,hooks={}){
 requireValue(Number.isInteger(side)&&side>=2&&side<=1792,'Unsupported D2PRL grid');let stamp=performance.now();
 return{n:side*side,allocate(count){checkAbort(hooks.signal);hooks.account?.(count*4);try{return hooks.allocate?hooks.allocate(count):allocateFloats(count);}catch(error){throw normalizeResourceError(error,{requestedBytes:count*4,allocationKind:'array-buffer',allocation:'d2prl-candidates'});}},async checkpoint(){checkAbort(hooks.signal);if(performance.now()-stamp>=8){await controlCheckpoint(hooks.signal);stamp=performance.now();}},done(){checkAbort(hooks.signal);}};
}
async function validate(pair,n,checkpoint,count=1){
 requireValue(pair?.x instanceof Float32Array&&pair.y instanceof Float32Array&&pair.x.length===count*n&&pair.y.length===count*n,'Float32 offset planes required');
 for(let i=0;i<pair.x.length;i++){requireValue(Number.isFinite(pair.x[i])&&Number.isFinite(pair.y[i]),'Nonfinite offset');if((i&8191)===0)await checkpoint();}
}
export async function initialOffsets(side,random,hooks={}){
 const s=setup(side,hooks),pairs=[];
 for(let branch=0;branch<2;branch++){const pair={x:s.allocate(s.n),y:s.allocate(s.n)};for(const axis of ['x','y']){const noise=await random.values(s.n,hooks);for(let i=0;i<s.n;i++){const coordinate=axis==='x'?i%side:Math.floor(i/side);pair[axis][i]=f(-coordinate+f(side*noise[i]));if((i&8191)===0)await s.checkpoint();}}pairs.push(pair);}s.done();return{zm:pairs[0],cnn:pairs[1]};
}
export async function searchBounds(pair,side,hooks={}){
 const s=setup(side,hooks);await validate(pair,s.n,s.checkpoint);const bounds={minX:s.allocate(s.n),maxX:s.allocate(s.n),minY:s.allocate(s.n),maxY:s.allocate(s.n)};
 for(let i=0;i<s.n;i++){bounds.minX[i]=f(pair.x[i]-25);bounds.maxX[i]=f(pair.x[i]+25);bounds.minY[i]=f(pair.y[i]-25);bounds.maxY[i]=f(pair.y[i]+25);if((i&8191)===0)await s.checkpoint();}s.done();return bounds;
}
export async function randomCandidates(pair,bounds,side,random,hooks={}){
 const s=setup(side,hooks);await validate(pair,s.n,s.checkpoint);for(const key of ['minX','maxX','minY','maxY'])requireValue(bounds?.[key] instanceof Float32Array&&bounds[key].length===s.n,'Search bounds required');
 for(let i=0;i<s.n;i++){requireValue(Number.isFinite(bounds.minX[i])&&Number.isFinite(bounds.maxX[i])&&Number.isFinite(bounds.minY[i])&&Number.isFinite(bounds.maxY[i])&&bounds.minX[i]<=bounds.maxX[i]&&bounds.minY[i]<=bounds.maxY[i],'Invalid search interval');if((i&8191)===0)await s.checkpoint();}
 const out={x:s.allocate(5*s.n),y:s.allocate(5*s.n)},noise=await random.values(2*s.n,hooks);
 for(let i=0;i<s.n;i++){const dx=f(f(bounds.maxX[i]-bounds.minX[i])/2),dy=f(f(bounds.maxY[i]-bounds.minY[i])/2),a=noise[i],b=f(1+noise[s.n+i]),x0=f(bounds.minX[i]+f(dx*a)),x1=f(bounds.minX[i]+f(dx*b)),y0=f(bounds.minY[i]+f(dy*a)),y1=f(bounds.minY[i]+f(dy*b));out.x[i]=x0;out.x[s.n+i]=x1;out.x[2*s.n+i]=x0;out.x[3*s.n+i]=x1;out.y[i]=y0;out.y[s.n+i]=y0;out.y[2*s.n+i]=y1;out.y[3*s.n+i]=y1;out.x[4*s.n+i]=pair.x[i];out.y[4*s.n+i]=pair.y[i];if((i&8191)===0)await s.checkpoint();}s.done();return out;
}
export async function wrapOffsets(pair,side,hooks={}){
 const s=setup(side,hooks),count=pair?.x?.length/s.n;requireValue(Number.isInteger(count)&&count>=1&&count<=13,'Candidate count required');await validate(pair,s.n,s.checkpoint,count);const out=hooks.inPlace?pair:{x:s.allocate(count*s.n),y:s.allocate(count*s.n)};
 // inPlace is only used on uncommitted, exclusively owned candidates. Its
 // caller retries generation and wrapping together, never a partial mutation.
 // Keep both native where/remainder stages: adding side to a tiny negative
 // remainder can round exactly to side, requiring the second wrap.
 const remainder=value=>{const r=f(value%side);return r<0?f(r+side):r;};
 const wrap=(value,coordinate)=>{let absolute=f(value+coordinate);if(absolute<=0)absolute=remainder(absolute);if(absolute>=side)absolute=remainder(absolute);return f(absolute-coordinate);};
 for(let q=0;q<count;q++)for(let i=0;i<s.n;i++){const j=q*s.n+i;out.x[j]=wrap(pair.x[j],i%side);out.y[j]=wrap(pair.y[j],Math.floor(i/side));if((i&8191)===0)await s.checkpoint();}s.done();return out;
}
export async function propagateOffsets(pair,side,hooks={}){
 const s=setup(side,hooks);await validate(pair,s.n,s.checkpoint);s.done();let geometry;
 if(hooks.geometry)geometry=hooks.geometry(side);else{hooks.account?.(32*side+512);geometry=completePeriodicGeometry({side,columns:[],rows:[],ready:false});}
 requireValue(geometry?.ready===true&&geometry.side===side&&geometry.columns?.length===4&&geometry.rows?.length===4&&[...geometry.columns,...geometry.rows].every(v=>v instanceof Int32Array&&v.length===side),'Owned periodic propagation geometry required');s.done();
 const n=s.n,out={x:s.allocate(13*n),y:s.allocate(13*n)},[cp2,cp1,cm1,cm2]=geometry.columns,[rp2,rp1,rm1,rm2]=geometry.rows;
 for(let i=0;i<n;i++){
  const x=i%side,y=Math.floor(i/side),r=i-x,cMinus1=cm1[x],cPlus1=cp1[x],cMinus2=cm2[x],cPlus2=cp2[x],rMinus1=rm1[y],rPlus1=rp1[y],rMinus2=rm2[y],rPlus2=rp2[y],
   a1=r+cMinus1,a2=r+cPlus1,a3=rMinus1+x,a4=rPlus1+x,a5=rMinus1+cMinus1,a6=rPlus1+cPlus1,a7=rMinus1+cPlus1,a8=rPlus1+cMinus1,
   b1=r+cMinus2,b2=r+cPlus2,b3=rMinus2+x,b4=rPlus2+x,b5=rMinus2+cMinus2,b6=rPlus2+cPlus2,b7=rMinus2+cPlus2,b8=rPlus2+cMinus2;
  for(let axis=0;axis<2;axis++){
   const a=axis===0?pair.x:pair.y,b=axis===0?out.x:out.y;
   b[i]=a[i];b[n+i]=a[a1];b[2*n+i]=a[a2];b[3*n+i]=a[a3];b[4*n+i]=a[a4];
   b[5*n+i]=f(f(2*a[a1])-a[b1]);b[6*n+i]=f(f(2*a[a2])-a[b2]);b[7*n+i]=f(f(2*a[a3])-a[b3]);b[8*n+i]=f(f(2*a[a4])-a[b4]);
   b[9*n+i]=f(f(2*a[a5])-a[b5]);b[10*n+i]=f(f(2*a[a6])-a[b6]);b[11*n+i]=f(f(2*a[a7])-a[b7]);b[12*n+i]=f(f(2*a[a8])-a[b8]);
  }
  if((i&8191)===0)await s.checkpoint();
 }s.done();return out;
}
export async function nonlocalOffsets(pair,side,random,hooks={}){
 const s=setup(side,hooks);await validate(pair,s.n,s.checkpoint);const out={x:s.allocate(s.n),y:s.allocate(s.n)},nx=await random.values(s.n,hooks),ny=await random.values(s.n,hooks);
 for(let i=0;i<s.n;i++){const local=f(f(pair.x[i]*pair.x[i])+f(pair.y[i]*pair.y[i]))<=25;out.x[i]=local?f(-(i%side)+f(side*nx[i])):pair.x[i];out.y[i]=local?f(-Math.floor(i/side)+f(side*ny[i])):pair.y[i];if((i&8191)===0)await s.checkpoint();}s.done();return out;
}
