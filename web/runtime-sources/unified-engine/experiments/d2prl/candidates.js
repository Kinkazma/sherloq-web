// D2PRL native candidate transformations, separate from descriptor evaluation.
import{requireValue,checkAbort,controlCheckpoint,normalizeResourceError}from'../../src/errors.js';
const f=Math.fround;
function allocateFloats(count,allocation='d2prl-candidates'){
 try{return new Float32Array(count);}catch(error){throw normalizeResourceError(error,{requestedBytes:count*4,allocationKind:'array-buffer',allocation});}
}
// One pair of useful candidate planes. A caller must finish consuming a pair
// before begin() reuses it. Partial growth remains owned across a failed retry;
// no allocation is made before an actual transformation needs that capacity.
export function createCandidateWorkspace(side){
 requireValue(Number.isInteger(side)&&side>=2&&side<=448,'Unsupported D2PRL grid');
 const maximum=13*side*side,planes=[];let cursor=0,disposed=false,allocations=0,allocatedBytes=0;
 return{
  begin(){requireValue(!disposed,'Candidate workspace disposed');cursor=0;},
  allocate(count){
   requireValue(!disposed&&cursor<2&&Number.isInteger(count)&&count>=0&&count<=maximum,'Candidate workspace shape');
   const index=cursor++;let plane=planes[index];
   if(!plane||plane.length<count){plane=allocateFloats(count,'d2prl-candidate-workspace');planes[index]=plane;allocations++;allocatedBytes+=plane.byteLength;}
   return plane.length===count?plane:plane.subarray(0,count);
  },
  snapshot(){return{allocations,allocatedBytes,residentBytes:planes.reduce((sum,plane)=>sum+plane.byteLength,0)};},
  dispose(){planes.length=0;disposed=true;}
 };
}
function setup(side,hooks={}){
 requireValue(Number.isInteger(side)&&side>=2&&side<=448,'Unsupported D2PRL grid');let stamp=performance.now();
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
 const s=setup(side,hooks);await validate(pair,s.n,s.checkpoint);const out={x:s.allocate(13*s.n),y:s.allocate(13*s.n)},directions=[[0,1],[0,-1],[1,0],[-1,0]],extended=[...directions,[1,1],[-1,-1],[1,-1],[-1,1]];
 for(let i=0;i<s.n;i++){const x=i%side,y=Math.floor(i/side),at=(dy,dx)=>((y-dy+side*2)%side)*side+(x-dx+side*2)%side;for(const axis of ['x','y']){const a=pair[axis],b=out[axis];b[i]=a[i];for(let j=0;j<4;j++){const [dy,dx]=directions[j];b[(j+1)*s.n+i]=a[at(dy,dx)];}for(let j=0;j<8;j++){const [dy,dx]=extended[j];b[(j+5)*s.n+i]=f(f(2*a[at(dy,dx)])-a[at(2*dy,2*dx)]);}}if((i&8191)===0)await s.checkpoint();}s.done();return out;
}
export async function nonlocalOffsets(pair,side,random,hooks={}){
 const s=setup(side,hooks);await validate(pair,s.n,s.checkpoint);const out={x:s.allocate(s.n),y:s.allocate(s.n)},nx=await random.values(s.n,hooks),ny=await random.values(s.n,hooks);
 for(let i=0;i<s.n;i++){const local=f(f(pair.x[i]*pair.x[i])+f(pair.y[i]*pair.y[i]))<=25;out.x[i]=local?f(-(i%side)+f(side*nx[i])):pair.x[i];out.y[i]=local?f(-Math.floor(i/side)+f(side*ny[i])):pair.y[i];if((i&8191)===0)await s.checkpoint();}s.done();return out;
}
