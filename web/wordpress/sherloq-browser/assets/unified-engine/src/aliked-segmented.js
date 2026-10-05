import "../../runtime-context.js?v=0.14.5";
import {createNeuralTensor} from './neural-tensor-store.js';
import {createTemporarySession} from './temporary-storage.js';
import {checkAbort,requireValue,checkpoint} from './errors.js';
import {executionSummary} from './neural-execution-summary.js';
const MiB=1024**2,f=Math.fround,tensor=(data,dims)=>({data,dims,type:'float32'});
/** Native ALIKED scale pyramid and global DKD/SDDH. Feature pixels are recreated
 * from the four scales, not stored as a 128-channel source-sized allocation. */
export async function extractAlikedSegmented(image,{pool,budget,preparation,signal,onProgress,backend='auto',windowBytes=64*MiB,storage='auto',getTemporarySession:externalSession,returnDense=false}={}){
 const {width:w,height:h}=image,W=Math.ceil(w/32)*32,H=Math.ceil(h/32)*32,left=Math.floor((W-w)/2),topPad=Math.floor((H-h)/2),owned=new Set(),executions=executionSummary();let session,pending,complete=false,outputRelease;
 const getTemporarySession=externalSession??(async()=>session??(pending??=createTemporarySession({budget,signal}).then(s=>session=s)));
 const make=async(c,hh,ww)=>{const bytes=c*hh*ww*4,t=await createNeuralTensor(c,hh,ww,{budget,signal,getTemporarySession,storage:storage==='auto'?(bytes>Math.min(budget.limit/12,(budget.limit-budget.total())/4)?'temporary':'memory'):storage});owned.add(t);return t;};
 const drop=async t=>{if(owned.delete(t))await t.dispose();};
 const run=async(name,feeds,workspaceBytes,outputBytes,cpuRequired=false)=>{const r=await pool.run('aliked/'+name,feeds,{signal,onProgress,backend,cpuRequired,workspaceBytes:32*MiB+workspaceBytes,outputBytes});executions.add(name,r.metrics);return r;};
 const source={channels:3,width:W,height:H,async readRows(top,rows){const release=budget.reserve(3*rows*W*4);try{const data=new Float32Array(3*rows*W);for(let y=0;y<rows;y++){await checkpoint(signal);const sy=Math.min(h-1,Math.max(0,top+y-topPad));for(let x=0;x<W;x++){const sx=Math.min(w-1,Math.max(0,x-left));for(let c=0;c<3;c++)data[(c*rows+y)*W+x]=image.data[(sy*w+sx)*3+c]/255;}}return {data,dims:[1,3,rows,W],release};}catch(e){release();throw e;}}};
 function core(data,c,inputRows,width,crop,rows){const result=new Float32Array(c*rows*width);for(let k=0;k<c;k++)result.set(data.subarray((k*inputRows+crop)*width,(k*inputRows+crop+rows)*width),k*rows*width);return result;}
 function stepFor(width,channels,stride=1){return Math.max(1,Math.floor(Math.min(windowBytes,Math.max(4*MiB,(budget.limit-budget.total()-64*MiB)/8))/(width*Math.max(channels,32)*4*stride)));}
 async function local(input,name,c,{stride=1,radius=0,activationChannels=Math.max(input.channels,c)}={}){
  const height=input.height/stride,width=input.width/stride,target=await make(c,height,width),step=stepFor(input.width,activationChannels,stride);
  for(let y=0;y<height;y+=step){const rows=Math.min(step,height-y),lo=Math.max(0,Math.floor((y*stride-radius)/stride)*stride),hi=Math.min(input.height,Math.ceil(((y+rows)*stride+radius)/stride)*stride),p=await input.readRows(lo,hi-lo);let r,lease;
   try{const oh=(hi-lo)/stride;r=await run(name,{x:tensor(p.data,p.dims)},(hi-lo)*input.width*activationChannels*24,c*oh*width*4);lease=budget.reserve(c*rows*width*4);await target.writeRows(y,rows,core(r.result.result.data,c,oh,width,y-lo/stride,rows),{signal});}finally{lease?.();r?.release();p.release();}onProgress?.({phase:'aliked-local',model:name,completed:y+rows,total:height});
  }return target;
 }
 async function second(input){
  const projected=await make(32,input.height,input.width),pooled=await make(32,input.height/4,input.width/4),step=Math.max(4,Math.floor(stepFor(input.width,32)/4)*4);
  for(let y=0;y<input.height;y+=step){const rows=Math.min(step,input.height-y),lo=Math.max(0,Math.floor((y-2)/4)*4),hi=Math.min(input.height,Math.ceil((y+rows+2)/4)*4),p=await input.readRows(lo,hi-lo);let r,lease;
   try{r=await run('second',{x:tensor(p.data,p.dims)},(hi-lo)*input.width*32*24,(hi-lo)*input.width*32*4*17/16);lease=budget.reserve(rows*input.width*32*4*17/16);await projected.writeRows(y,rows,core(r.result.projected.data,32,hi-lo,input.width,y-lo,rows),{signal});await pooled.writeRows(y/4,rows/4,core(r.result.pooled.data,32,(hi-lo)/4,input.width/4,(y-lo)/4,rows/4),{signal});}finally{lease?.();r?.release();p.release();}onProgress?.({phase:'aliked-local',model:'second',completed:y+rows,total:input.height});
  }return {projected,pooled};
 }
 async function deform(input,prefix,c,gate){
  const target=await make(c,input.height,input.width),step=stepFor(input.width,Math.max(c,input.channels));
  for(let y=0;y<input.height;y+=step){const rows=Math.min(step,input.height-y),lo=Math.max(0,y-1),hi=Math.min(input.height,y+rows+1),p=await input.readRows(lo,hi-lo);let offsets,values,expanded,offsetLease,coreLease,activated;
   try{
    offsets=await run(prefix+'-offset',{x:tensor(p.data,p.dims),bound:tensor(Float32Array.of(Math.max(input.width,input.height)/4),[])},p.data.byteLength*4,18*(hi-lo)*input.width*4);
    const od=offsets.result.result.data,ow=input.width,on=(hi-lo)*ow;let lower=y-1,upper=y+rows+1;
    for(let k=0;k<9;k++)for(let yy=0;yy<rows;yy++)for(let x=0;x<ow;x++){const sy=f(y+yy+Math.floor(k/3)-1+od[(2*k)*on+(y-lo+yy)*ow+x]);lower=Math.min(lower,Math.floor(sy));upper=Math.max(upper,Math.floor(sy)+2);}
    const a=Math.max(0,lower),b=Math.min(input.height,upper);requireValue(b>a,'Empty deformable input range.');expanded=await input.readRows(a,b-a);offsetLease=budget.reserve(18*(b-a)*ow*4);const fullOffset=new Float32Array(18*(b-a)*ow),en=(b-a)*ow;
    for(let k=0;k<18;k++)for(let yy=0;yy<rows;yy++)for(let x=0;x<ow;x++){const old=od[k*on+(y-lo+yy)*ow+x],dy=Math.floor(k/2/3)-1;fullOffset[k*en+(y-a+yy)*ow+x]=k%2?old:f(f(f(y+yy+dy+old)-a)-(y-a+yy+dy));}
    values=await run(prefix+'-deform',{x:tensor(expanded.data,expanded.dims),offset:tensor(fullOffset,[1,18,b-a,ow])},(b-a)*ow*Math.max(input.channels,c)*32,c*(b-a)*ow*4,true);
    coreLease=budget.reserve(c*rows*ow*4);let data=core(values.result.result.data,c,b-a,ow,y-a,rows);
    if(gate){activated=await run('gate',{x:tensor(data,[1,c,rows,ow])},data.byteLength*2,data.byteLength);data=activated.result.result.data;}
    await target.writeRows(y,rows,data,{signal});
   }finally{activated?.release();coreLease?.();values?.release();offsetLease?.();expanded?.release();offsets?.release();p.release();}onProgress?.({phase:'aliked-deformable',model:prefix,completed:y+rows,total:input.height});
  }return target;
 }
 async function block(input,index,c){
  const a=await deform(input,`b${index}-c1`,c,true),b=await deform(a,`b${index}-c2`,c,false);await drop(a);const target=await make(c,input.height,input.width),step=stepFor(input.width,c);
  for(let y=0;y<input.height;y+=step){const rows=Math.min(step,input.height-y),x=await input.readRows(y,rows);let yy,r;try{yy=await b.readRows(y,rows);r=await run(`b${index}-residual`,{x:tensor(x.data,x.dims),y:tensor(yy.data,yy.dims)},rows*input.width*c*16,rows*input.width*c*4);await target.writeRows(y,rows,r.result.result.data,{signal});}finally{r?.release();yy?.release();x.release();}}await drop(b);return target;
 }
 function resized(input){return {channels:input.channels,width:W,height:H,async readRows(y,rows){
  const sy=f((input.height-1)/(H-1)),sx=f((input.width-1)/(W-1)),a=Math.floor(f(y*sy)),b=Math.min(input.height,Math.floor(f((y+rows-1)*sy))+2),p=await input.readRows(a,b-a),release=budget.reserve(input.channels*rows*W*4);
  try{const data=new Float32Array(input.channels*rows*W),pw=input.width,ph=b-a;for(let yy=0;yy<rows;yy++){checkAbort(signal);const fy=f((y+yy)*sy),iy=Math.floor(fy),iy1=Math.min(input.height-1,iy+1),wy=f(fy-iy),wy0=f(1-wy);for(let x=0;x<W;x++){const fx=f(x*sx),ix=Math.floor(fx),ix1=Math.min(pw-1,ix+1),wx=f(fx-ix),wx0=f(1-wx);for(let c=0;c<input.channels;c++){const off=c*ph*pw,v0=f(f(p.data[off+(iy-a)*pw+ix]*wx0)+f(p.data[off+(iy-a)*pw+ix1]*wx)),v1=f(f(p.data[off+(iy1-a)*pw+ix]*wx0)+f(p.data[off+(iy1-a)*pw+ix1]*wx));data[(c*rows+yy)*W+x]=f(f(v0*wy0)+f(v1*wy));}}}return {data,dims:[1,input.channels,rows,W],release};}catch(e){release();throw e;}finally{p.release();}
 }};}
 let pyramid;
 try{
  const first=await local(source,'first-pool',16,{stride:2,radius:2,activationChannels:16}),s2=await second(first);await drop(first);
  const b3=await block(s2.pooled,3,64);await drop(s2.pooled);const p3=await local(b3,'project3',32),p4input=await local(b3,'pool4',64,{stride:4});await drop(b3);
  const b4=await block(p4input,4,128);await drop(p4input);const p4=await local(b4,'project4',32);await drop(b4);
  const firstProject={channels:32,width:W,height:H,async readRows(y,rows){const a=Math.max(0,y-2),b=Math.min(H,y+rows+2),p=await source.readRows(a,b-a);let r,lease;try{r=await run('first-project',{x:tensor(p.data,p.dims)},(b-a)*W*32*24,(b-a)*W*32*4);lease=budget.reserve(32*rows*W*4);return {data:core(r.result.result.data,32,b-a,W,y-a,rows),dims:[1,32,rows,W],release:lease};}catch(e){lease?.();throw e;}finally{r?.release();p.release();}}};
  pyramid=[firstProject,...[s2.projected,p3,p4].map(resized)];
  async function features(y,rows,normalize=false){const release=budget.reserve(128*rows*W*4);let r;try{const data=new Float32Array(128*rows*W);for(let i=0;i<4;i++){const p=await pyramid[i].readRows(y,rows);try{data.set(p.data,i*32*rows*W);}finally{p.release();}}if(!normalize)return {data,dims:[1,128,rows,W],release};r=await run('normalize',{x:tensor(data,[1,128,rows,W])},data.byteLength*2,data.byteLength);release();return {data:r.result.result.data,dims:[1,128,rows,W],release:r.release};}catch(e){r?.release();release();throw e;}}
  const scores=await make(1,h,w),step=stepFor(W,128);
  for(let y=0;y<h;y+=step){const rows=Math.min(step,h-y),a=Math.max(0,y+topPad-3),b=Math.min(H,y+topPad+rows+3),p=await features(a,b-a);let r,lease;try{r=await run('score',{x:tensor(p.data,p.dims)},p.data.byteLength*3,(b-a)*W*4);lease=budget.reserve(rows*w*4);const data=new Float32Array(rows*w);for(let yy=0;yy<rows;yy++)data.set(r.result.result.data.subarray((y+topPad-a+yy)*W+left,(y+topPad-a+yy)*W+left+w),yy*w);await scores.writeRows(y,rows,data,{signal});}finally{lease?.();r?.release();p.release();}onProgress?.({phase:'aliked-score',completed:y+rows,total:h});}
  if(returnDense){const dense=await make(128,h,w);for(let y=0;y<h;y+=step){const rows=Math.min(step,h-y),p=await features(y+topPad,rows,true),lease=budget.reserve(128*rows*w*4);try{const data=new Float32Array(128*rows*w);for(let c=0;c<128;c++)for(let yy=0;yy<rows;yy++)data.set(p.data.subarray((c*rows+yy)*W+left,(c*rows+yy)*W+left+w),(c*rows+yy)*w);await dense.writeRows(y,rows,data,{signal});}finally{lease();p.release();}}complete=true;return {features:dense,scores,executions:executions.values(),release:cleanup};}
  const nms=await local(scores,'nms',1,{radius:10}),scanRows=Math.max(1,Math.floor(MiB/(w*8)));let mean=0,count=0;
  for(let y=0;y<h;y+=scanRows){const rows=Math.min(scanRows,h-y),p=await scores.readRows(y,rows),q=await nms.readRows(y,rows);try{for(const v of p.data)mean+=v;for(let yy=0;yy<rows;yy++)if(y+yy>=2&&y+yy<h-2)for(let x=2;x<w-2;x++)count+=q.data[yy*w+x]>f(.2);}finally{q.release();p.release();}}
  mean=f(mean/(w*h));const threshold=count ? f(.2) : mean;
  if(!count)for(let y=0;y<h;y+=scanRows){const rows=Math.min(scanRows,h-y),q=await nms.readRows(y,rows);try{for(let yy=0;yy<rows;yy++)if(y+yy>=2&&y+yy<h-2)for(let x=2;x<w-2;x++)count+=q.data[yy*w+x]>threshold;}finally{q.release();}}
  let indices;const candidateLease=budget.reserve(count*8);
  try{const ids=new Int32Array(count),values=new Float32Array(count);let at=0;for(let y=0;y<h;y+=scanRows){const rows=Math.min(scanRows,h-y),q=await nms.readRows(y,rows),p=await scores.readRows(y,rows);try{for(let yy=0;yy<rows;yy++)if(y+yy>=2&&y+yy<h-2)for(let x=2;x<w-2;x++)if(q.data[yy*w+x]>threshold){ids[at]=(y+yy)*w+x;values[at++]=p.data[yy*w+x];}}finally{p.release();q.release();}}indices=await preparation.selectCandidates(ids,values,{signal});}finally{candidateLease();}await drop(nms);
  const k=indices.length;outputRelease=budget.reserve(k*131*4+8);const points=new Float32Array(k*2),descriptors=new Float32Array(k*128),confidence=new Float32Array(k),wh=Float32Array.of(w-1,h-1);let localized,described;
  const sparseLease=budget.reserve(Math.max(1,k)*16*4*128*8+MiB);
  async function integerFeatures(coords){
   const data=new Float32Array(coords.length*128),groups=new Map(),chunk=Math.max(1,stepFor(W,128));
   for(let i=0;i<coords.length;i++){const [x,y]=coords[i];if(x<0||x>=w||y<0||y>=h)continue;const bucket=Math.floor((y+topPad)/chunk);if(!groups.has(bucket))groups.set(bucket,[]);groups.get(bucket).push(i);}
   for(const [bucket,ids]of [...groups].sort((a,b)=>a[0]-b[0])){const y=bucket*chunk,rows=Math.min(chunk,H-y),p=await features(y,rows,true);try{for(const i of ids){const [x,yy]=coords[i];for(let c=0;c<128;c++)data[i*128+c]=p.data[(c*rows+yy+topPad-y)*W+x+left];}}finally{p.release();}}
   return data;
  }
  function sampleGeometry(positions){const coords=[],weights=new Float32Array(positions.length*2);for(let i=0;i<positions.length/2;i++){const x=f(f(f(positions[2*i]+1)/2)*(w-1)),y=f(f(f(positions[2*i+1]+1)/2)*(h-1)),ix=Math.floor(x),iy=Math.floor(y),dx=f(x-ix),dy=f(y-iy);coords.push([ix,iy],[ix+1,iy],[ix,iy+1],[ix+1,iy+1]);weights.set([f(f(1-dx)*f(1-dy)),f(dx*f(1-dy)),f(f(1-dx)*dy),f(dx*dy)],i*4);}return {coords,weights};}
  try{if(k){
   const patch=new Float32Array(k*25),xy=new Float32Array(k*2);
   for(let i=0;i<k;i++){const x=indices[i]%w,y=Math.floor(indices[i]/w);xy.set([x,y],i*2);for(let yy=0;yy<5;yy++)await scores.readInto(patch.subarray(i*25+yy*5,i*25+(yy+1)*5),(y+yy-2)*w+x-2,{signal});}
   localized=await run('localize',{patch:tensor(patch,[k,25]),xy:tensor(xy,[k,2]),wh:tensor(wh,[2])},k*1024,k*8);const keypoints=localized.result.keypoints;
   const geometry=sampleGeometry(keypoints.data),corners=[];
   for(let i=0;i<k;i++){const px=f(f(f(keypoints.data[i*2]/2)+.5)*(w-1)),py=f(f(f(keypoints.data[i*2+1]/2)+.5)*(h-1)),x=Math.max(0,Math.min(w-4,Math.trunc(Math.trunc(px)-.5))),y=Math.max(0,Math.min(h-4,Math.trunc(Math.trunc(py)-.5)));for(let yy=0;yy<3;yy++)for(let xx=0;xx<3;xx++)corners.push([x+xx,y+yy]);
    let value=0;for(let j=0;j<4;j++){const [gx,gy]=geometry.coords[i*4+j];if(gx>=0&&gx<w&&gy>=0&&gy<h){const scalar=new Float32Array(1);await scores.readInto(scalar,gy*w+gx,{signal});value=f(value+f(scalar[0]*geometry.weights[i*4+j]));}}confidence[i]=value;
   }
   const flat=await integerFeatures(corners),patches=new Float32Array(k*128*9);for(let i=0;i<k;i++)for(let c=0;c<128;c++)for(let j=0;j<9;j++)patches[(i*128+c)*9+j]=flat[(i*9+j)*128+c];
   described=await run('describe-offset',{patch:tensor(patches,[k,128,3,3]),keypoints,wh:tensor(wh,[2])},k*32768,k*16*4*4);const sample=sampleGeometry(described.result.positions.data),values=await integerFeatures(sample.coords),sampled=new Float32Array(k*128*16);
   for(let i=0;i<k;i++)for(let pos=0;pos<16;pos++)for(let c=0;c<128;c++){let value=0;for(let j=0;j<4;j++)value=f(value+f(values[((i*16+pos)*4+j)*128+c]*sample.weights[(i*16+pos)*4+j]));sampled[(i*128+c)*16+pos]=value;}
   const r=await run('describe',{x:tensor(sampled,[k,128,16,1])},sampled.byteLength*4,k*128*4);try{descriptors.set(r.result.descriptors.data);}finally{r.release();}
   for(let i=0;i<points.length;i++){const size=i%2?h:w,pixel=f(f((size-1)*f(keypoints.data[i]+1))/2);points[i]=f(f(pixel+.5)-.5);}
  }}finally{described?.release();localized?.release();sparseLease();}
  for(const t of [...owned])await drop(t);if(!externalSession)await session?.dispose();
  const result={keypoints:tensor(points,[1,k,2]),descriptors:tensor(descriptors,[1,k,128]),keypoint_scores:tensor(confidence,[1,k]),size:tensor(Float32Array.of(w,h),[1,2]),execution:{graphs:executions.values(),globalCandidates:count,selectedIndices:Array.from(indices),globalMean:mean,paddedDimensions:[W,H],segmented:true},release:outputRelease};complete=true;return result;
 }finally{if(!complete)await cleanup();}
 async function cleanup(){for(const t of [...owned])await drop(t);outputRelease?.();if(!externalSession)await session?.dispose();}
}
