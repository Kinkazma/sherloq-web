import {requireValue,createCooperator,checkAbort,EngineError} from './errors.js';

// Independent numerical implementation of the moment / word / phrase stages
// described in Wang et al., TIFS 18 (2023), DOI 10.1109/TIFS.2023.3234861.
// This is a core, not a complete detector: VLFeat detection, structured edges,
// RST/MLESAC and the SSIM/ROI localization stage have separate contracts below.
export const SSG_REFERENCE=Object.freeze({paper:'https://arxiv.org/abs/2207.09135v2',doi:'10.1109/TIFS.2023.3234861',source:'https://github.com/ChaoWang1016/word2phraseCMFD',sourceCommit:'66bb26eca0c7e95c76042d5bcca58f744d70a27d',status:'scientific-core-only',completeDetector:false});
export const SSG_DEFAULTS=Object.freeze({blockSize:20,radialSamples:30,angularSamples:36,spatialK:3,ratio:.6,absolute:.1,minimumDistance:50,salienceSigma:.001,angularBins:80,distanceBins:80,minimumBinCount:6,clusterNeighbors:3,normalizationLongEdge:3000,peakThreshold:0,edgeThreshold:50});
export function ssgParams(input={}){
 const p={...SSG_DEFAULTS,...input};
 for(const k of ['blockSize','radialSamples','angularSamples','spatialK','angularBins','distanceBins','minimumBinCount','clusterNeighbors','normalizationLongEdge'])requireValue(Number.isSafeInteger(p[k])&&p[k]>0,`Invalid SSG ${k}.`);
 requireValue(p.blockSize>=2&&p.radialSamples>=2&&p.angularSamples>=7&&p.spatialK>=1,'Invalid SSG moment sampling.');
 for(const k of ['ratio','absolute','minimumDistance','salienceSigma','peakThreshold','edgeThreshold'])requireValue(Number.isFinite(p[k])&&p[k]>=0,`Invalid SSG ${k}.`);
 requireValue(p.ratio>0&&p.ratio<=1&&p.salienceSigma>0,'Invalid SSG thresholds.');
 return p;
}
const numeric=a=>ArrayBuffer.isView(a)&&!(a instanceof DataView)&&a.every(Number.isFinite);
const typed=(a,n,message)=>requireValue(numeric(a)&&a.length%n===0,message);
const admit=(hooks,n)=>{requireValue(Number.isSafeInteger(n)&&n>=0,'Invalid SSG allocation estimate.');hooks.reserveMemory?.(n);};
const J1_ROOTS=Object.freeze([3.8317059702075125,7.015586669815619,10.173468135062722,13.323691936314223,16.470630050877634]);

// Ascending Bessel power series; the supported argument is <= the fifth J1
// root. Float64 avoids the cancellation of a Float32 recurrence in this range.
export function ssgBesselJ(order,x){
 requireValue([1,2].includes(order)&&Number.isFinite(x)&&Math.abs(x)<=17,'Invalid SSG Bessel argument.');
 const z=x/2;let term=order===1?z:z*z/2,sum=term,comp=0;
 for(let k=1;k<90;k++){
  term*=-(z*z)/(k*(k+order));const corrected=term-comp,next=sum+corrected;comp=(next-sum)-corrected;sum=next;
  if(Math.abs(term)<Number.EPSILON*Math.max(1,Math.abs(sum)))break;
 }
 return sum;
}

export function ssgMomentBasis(input={},hooks={}){
 const p=ssgParams(input),size=p.blockSize,dims=16,count=size*size;
 admit(hooks,count*dims*16+4*p.radialSamples*8);const real=new Float64Array(count*dims),imag=new Float64Array(count*dims),radial=new Float64Array(4*p.radialSamples);
 for(let n=0;n<4;n++)for(let r=0;r<p.radialSamples;r++){
  const rho=(size-1)/size*r/(p.radialSamples-1),root=J1_ROOTS[n+1];
  radial[n*p.radialSamples+r]=ssgBesselJ(1,rho*root)*rho/(Math.PI*ssgBesselJ(2,root)**2);
 }
 for(let a=0;a<p.angularSamples;a++){
  const angle=2*Math.PI*a/p.angularSamples,ca=Math.cos(angle),sa=Math.sin(angle);
  for(let r=0;r<p.radialSamples;r++){
   const radius=(size-1)/2*r/(p.radialSamples-1),cx=radius*ca,cy=radius*sa;
   // Coordinates follow the author's row/column moment convention. The image
   // block is row-major, while its moment array was column-major in MATLAB.
   for(let y=0;y<size;y++)for(let x=0;x<size;x++){
    const gx=Math.max(0,1-Math.abs(y-(size-1)/2-cx)),gy=Math.max(0,1-Math.abs(x-(size-1)/2-cy)),weight=gx*gy;if(!weight)continue;
    const base=(y*size+x)*dims;
    for(let m=0;m<4;m++)for(let n=0;n<4;n++){
     const value=weight*radial[n*p.radialSamples+r],id=base+m*4+n;
     real[id]+=value*Math.cos(m*angle);imag[id]+=value*Math.sin(m*angle);
    }
   }
  }
 }
 let norm=0;for(let i=0;i<count;i++)norm+=real[i*dims]**2+imag[i*dims]**2;norm=Math.sqrt(norm);
 requireValue(norm>0&&Number.isFinite(norm),'Degenerate SSG basis.');
 for(let i=0;i<count;i++)for(let m=0;m<4;m++)for(let n=0;n<4;n++){const id=i*dims+m*4+n,scale=(n?2:1)/norm;real[id]*=scale;imag[id]*=scale;}
 return {real,imag,dimensions:dims,blockSize:size,convention:'author-row-column',parameters:p};
}

const reflect=(i,n)=>{while(i<0||i>=n)i=i<0?-i-1:2*n-i-1;return i;};
function resizeCoefficients(source,target){
 const scale=target/source,filter=scale<1?scale:1,radius=1/filter,result=[];
 for(let i=0;i<target;i++){
  const center=(i+.5)/scale-.5,left=Math.ceil(center-radius),right=Math.floor(center+radius),ids=[],weights=[];let sum=0;
  for(let j=left;j<=right;j++){const value=Math.max(0,1-Math.abs(center-j)*filter)*filter;if(value){ids.push(reflect(j,source));weights.push(value);sum+=value;}}
  result.push({ids,weights:weights.map(x=>x/sum)});
 }
 return result;
}

// Exposed to make crop geometry and downsampling separately testable. Point
// centers are integer source pixels; sigma is VLFeat's scale, not its diameter.
export function ssgSamplePatch(image,point,size=20){
 const {gray,width,height}=image;
 requireValue(Number.isInteger(width)&&width>0&&Number.isInteger(height)&&height>0&&numeric(gray)&&gray.length===width*height,'Invalid SSG grayscale image.');
 requireValue(point?.length===3&&point.every(Number.isFinite)&&point[2]>0&&Number.isInteger(size)&&size>=2,'Invalid SSG point.');
 return samplePatch(image,point,size);
}
function samplePatch({gray,width,height},point,size){
 const x=Math.round(point[0]),y=Math.round(point[1]),radius=Math.floor(size*point[2]/2),source=radius*2+1;
 if(x-radius<0||y-radius<0||x+radius>=width||y+radius>=height)return null;
 const coeff=resizeCoefficients(source,size),patch=new Float64Array(size*size);
 for(let j=0;j<size;j++)for(let i=0;i<size;i++){
  const xs=coeff[i],ys=coeff[j];let value=0;
  for(let yy=0;yy<ys.ids.length;yy++)for(let xx=0;xx<xs.ids.length;xx++)value+=gray[(y-radius+ys.ids[yy])*width+x-radius+xs.ids[xx]]*ys.weights[yy]*xs.weights[xx];
  patch[j*size+i]=value;
 }
 return patch;
}

export function ssgDescribePatch(patch,basis){
 typed(patch,1,'Invalid SSG patch.');requireValue(patch.length===basis.blockSize**2&&basis.dimensions===16,'Invalid SSG patch dimensions.');
 const real=new Float64Array(16),imag=new Float64Array(16);
 for(let i=0;i<patch.length;i++)for(let d=0;d<16;d++){real[d]+=patch[i]*basis.real[i*16+d];imag[d]+=patch[i]*basis.imag[i*16+d];}
 const magnitudes=new Float64Array(4),invariants=new Float64Array(24),moments=new Float64Array(24);
 for(let n=0;n<4;n++)magnitudes[n]=Math.hypot(real[n],imag[n]);
 for(let m=0;m<3;m++)for(let n=0;n<4;n++){
  const a=4+m*4+n,b=4+m*4+(n+1)%4,out=(m*4+n)*2;
  invariants[out]=real[a]*real[b]+imag[a]*imag[b];invariants[out+1]=imag[a]*real[b]-real[a]*imag[b];moments[out]=real[a];moments[out+1]=imag[a];
 }
 return {magnitudes,invariants,moments};
}

export async function ssgWordDescriptors(image,input={},hooks={}){
 checkAbort(hooks.signal);
 const p=ssgParams(input),points=image.points;typed(points,3,'Invalid SSG point coordinates.');
 requireValue(Number.isSafeInteger(image.width)&&image.width>0&&Number.isSafeInteger(image.height)&&image.height>0&&numeric(image.gray)&&image.gray.length===image.width*image.height,'Invalid SSG grayscale image.');
 requireValue(points.every((v,i)=>i%3!==2||v>0),'Invalid SSG scale.');checkAbort(hooks.signal);
 const n=points.length/3;admit(hooks,n*(3+4+24+24)*8+n*4+p.blockSize**2*8);const basis=ssgMomentBasis(p,hooks),cooperate=createCooperator(hooks.signal);
 const outPoints=new Float64Array(n*3),magnitudes=new Float64Array(n*4),invariants=new Float64Array(n*24),moments=new Float64Array(n*24),sourceIndices=new Uint32Array(n);let count=0;const seen=new Set();
 for(let i=0;i<n;i++){
  await cooperate();const point=[Math.round(points[i*3]),Math.round(points[i*3+1]),points[i*3+2]],key=point.join('/');if(seen.has(key))continue;seen.add(key);
  const patch=samplePatch(image,point,p.blockSize);if(!patch)continue;const desc=ssgDescribePatch(patch,basis);
  outPoints.set(point,count*3);magnitudes.set(desc.magnitudes,count*4);invariants.set(desc.invariants,count*24);moments.set(desc.moments,count*24);sourceIndices[count]=i;count++;hooks.onProgress?.((i+1)/Math.max(1,n));
 }
 return {points:outPoints.subarray(0,count*3),magnitudes:magnitudes.subarray(0,count*4),invariants:invariants.subarray(0,count*24),moments:moments.subarray(0,count*24),sourceIndices:sourceIndices.subarray(0,count),count,parameters:p,reference:SSG_REFERENCE};
}

function validateFeatures(features){
 typed(features.points,3,'Invalid SSG coordinates.');const count=features.points.length/3;
 for(const [name,dimensions] of [['magnitudes',4],['invariants',24],['moments',24]]){typed(features[name],dimensions,`Invalid SSG ${name}.`);requireValue(features[name].length===count*dimensions,`Invalid SSG ${name} count.`);}
 return count;
}
const squared=(data,dimensions,a,b)=>{let total=0;for(let d=0;d<dimensions;d++)total+=(data[a*dimensions+d]-data[b*dimensions+d])**2;return total;};
const spatialSquared=(points,a,b)=>(points[a*3]-points[b*3])**2+(points[a*3+1]-points[b*3+1])**2;

// Exact balanced tree: no all-pairs distance matrix, no approximate query which
// could silently change the ratio test. Equal distances use source order.
class NearestIndex{
 constructor(data,dimensions,ids){this.data=data;this.dimensions=dimensions;this.root=this.build(Array.from(ids));}
 build(ids){
  if(!ids.length)return null;const data=this.data,dims=this.dimensions;let axis=0,span=-1;
  for(let d=0;d<dims;d++){let min=Infinity,max=-Infinity;for(const i of ids){const v=data[i*dims+d];min=Math.min(min,v);max=Math.max(max,v);}if(max-min>span){axis=d;span=max-min;}}
  ids.sort((a,b)=>data[a*dims+axis]-data[b*dims+axis]||a-b);const mid=ids.length>>1;
  return {id:ids[mid],axis,left:this.build(ids.slice(0,mid)),right:this.build(ids.slice(mid+1))};
 }
 query(id,k){
  if(k<=0)return [];
  const best=[],data=this.data,dims=this.dimensions,insert=(candidate,distance)=>{let pos=0;while(pos<best.length&&(best[pos].distance<distance||best[pos].distance===distance&&best[pos].id<candidate))pos++;best.splice(pos,0,{id:candidate,distance});if(best.length>k)best.pop();};
  const visit=node=>{
   if(!node)return;const delta=data[id*dims+node.axis]-data[node.id*dims+node.axis],first=delta<=0?node.left:node.right,other=delta<=0?node.right:node.left;
   visit(first);if(node.id!==id)insert(node.id,squared(data,dims,id,node.id));if(best.length<k||delta*delta<=best.at(-1).distance)visit(other);
  };visit(this.root);return best;
 }
 range(id,radius){
  const found=[],data=this.data,dims=this.dimensions,limit=radius*radius;
  const visit=node=>{if(!node)return;const delta=data[id*dims+node.axis]-data[node.id*dims+node.axis];if(squared(data,dims,id,node.id)<=limit)found.push(node.id);if(delta<=radius)visit(node.left);if(delta>=-radius)visit(node.right);};visit(this.root);return found.sort((a,b)=>a-b);
 }
}
function magnitudeGroups(data,count){
 let groups=[Array.from({length:count},(_,i)=>i)];
 for(let d=0;d<4;d++){
  const next=[];for(const group of groups){let min=Infinity,max=-Infinity;for(const i of group){const value=data[i*4+d];min=Math.min(min,value);max=Math.max(max,value);}const middle=(min+max)/2,a=[],b=[];for(const i of group)(data[i*4+d]<=middle?a:b).push(i);next.push(a,b);}groups=next;
 }return groups;
}

export async function ssgMatchWords(features,input={},hooks={}){
 checkAbort(hooks.signal);
 const p=ssgParams(input),n=validateFeatures(features),groups=magnitudeGroups(features.magnitudes,n),cooperate=createCooperator(hooks.signal),rows=[];
 admit(hooks,n*512);let processed=0;
 for(const ids of groups){
  if(ids.length<3){processed+=ids.length;continue;}const tree=new NearestIndex(features.invariants,24,ids);
  for(const id of ids){
   await cooperate();const near=tree.query(id,2),d1=Math.sqrt(near[0].distance),d2=Math.sqrt(near[1].distance),a=near[0].id;
   // Published Eq. (3) matches both close neighbors; the author's MATLAB
   // source retained only the first. This core follows the paper and records
   // both, enforcing the spatial exclusion for both endpoints independently.
   if(d2<=p.absolute&&near.every(x=>spatialSquared(features.points,id,x.id)>=p.minimumDistance**2))for(const x of near)rows.push([id,x.id,Math.sqrt(x.distance),d2,'absolute']);
   else if(d1/d2<=p.ratio&&spatialSquared(features.points,id,a)>=p.minimumDistance**2)rows.push([id,a,d1,d2,'ratio']);
   processed++;hooks.onProgress?.(processed/Math.max(1,n));
  }
 }
 return {pairs:Uint32Array.from(rows.flatMap(x=>x.slice(0,2))),distances:Float64Array.from(rows.flatMap(x=>x.slice(2,4))),tests:rows.map(x=>x[4]),parameters:p,matchingDefinition:'paper-v2-I2NN-both-neighbors',reference:SSG_REFERENCE};
}

// edgeMap is the structured-edge response at the analysis resolution. It is
// supplied by its owner; a gradient/Sobel substitute is never selected here.
export async function ssgSalienceWeights({edgeMap,width,height,points},input={},hooks={}){
 checkAbort(hooks.signal);
 const p=ssgParams(input);typed(points,3,'Invalid SSG salience points.');requireValue(numeric(edgeMap)&&edgeMap.length===width*height&&Number.isSafeInteger(width)&&width>0&&Number.isSafeInteger(height)&&height>0&&edgeMap.every(x=>x>=0),'Invalid SSG structured-edge map.');
 const count=points.length/3;admit(hooks,count*8);const weights=new Float64Array(count),radius=Math.ceil(3*Math.sqrt(1/(2*p.salienceSigma))),cooperate=createCooperator(hooks.signal);
 const gaussian=Float64Array.from({length:radius+1},(_,i)=>Math.exp(-p.salienceSigma*i*i));admit(hooks,gaussian.byteLength);
 // Evaluate only requested samples. Finite 3-sigma support is the paper's
 // Eq. (10), using squared distance as in Eq. (8), rather than the published
 // MATLAB script's different exp(-sigma*distance) kernel.
 for(let i=0;i<count;i++){
  await cooperate();const x=Math.round(points[i*3]),y=Math.round(points[i*3+1]);requireValue(x>=0&&y>=0&&x<width&&y<height,'SSG salience point outside image.');let value=0;
  for(let yy=Math.max(0,y-radius);yy<=Math.min(height-1,y+radius);yy++)for(let xx=Math.max(0,x-radius);xx<=Math.min(width-1,x+radius);xx++)value+=edgeMap[yy*width+xx]*gaussian[Math.abs(xx-x)]*gaussian[Math.abs(yy-y)];weights[i]=value;
  hooks.onProgress?.((i+1)/Math.max(1,count));
 }
 let min=Infinity,max=-Infinity;for(const value of weights){min=Math.min(min,value);max=Math.max(max,value);}for(let i=0;i<count;i++)weights[i]=max>min?1+(weights[i]-min)/(max-min):1;
 return weights;
}

export async function ssgMatchPhrases(features,wordMatches,{edgeWeights,...input}={},hooks={}){
 checkAbort(hooks.signal);
 const p=ssgParams(input),n=validateFeatures(features);typed(wordMatches.pairs,2,'Invalid SSG word matches.');requireValue(wordMatches.pairs.every(x=>Number.isInteger(x)&&x>=0&&x<n),'Invalid SSG word match index.');
 requireValue(numeric(edgeWeights)&&edgeWeights.length===n&&edgeWeights.every(x=>x>=1&&x<=2),'SSG phrase pooling requires structured-edge salience weights.');
 const ids=Array.from(new Set(wordMatches.pairs)),count=ids.length;admit(hooks,count*(2+24)*8+count*512);const coords=new Float64Array(count*2),descriptors=new Float64Array(count*24),cooperate=createCooperator(hooks.signal);
 for(let i=0;i<count;i++){coords[i*2]=features.points[ids[i]*3];coords[i*2+1]=features.points[ids[i]*3+1];}const spatial=new NearestIndex(coords,2,Array.from({length:count},(_,i)=>i));
 for(let i=0;i<count;i++){
  await cooperate();const neighbors=spatial.query(i,Math.min(p.spatialK,count-1));for(let d=0;d<24;d++){let max=-Infinity;for(const neighbor of neighbors)max=Math.max(max,features.invariants[ids[neighbor.id]*24+d]);descriptors[i*24+d]=edgeWeights[ids[i]]*(features.invariants[ids[i]*24+d]+(neighbors.length?max:0));}
 }
 const rows=[];if(count>=3){const tree=new NearestIndex(descriptors,24,Array.from({length:count},(_,i)=>i));for(let i=0;i<count;i++){
  await cooperate();const near=tree.query(i,2),d1=Math.sqrt(near[0].distance),d2=Math.sqrt(near[1].distance),a=ids[i],b=ids[near[0].id];if(d1/d2<=p.ratio&&spatialSquared(features.points,a,b)>=p.minimumDistance**2)rows.push([a,b,d1,d2]);hooks.onProgress?.((i+1)/Math.max(1,count));
 }}
 return {pairs:Uint32Array.from(rows.flatMap(x=>x.slice(0,2))),distances:Float64Array.from(rows.flatMap(x=>x.slice(2))),pointIndices:Uint32Array.from(ids),descriptors,parameters:p,reference:SSG_REFERENCE};
}

function histogramKeep(values,bins,max,count,strict){
 const step=max/bins,counts=new Uint32Array(bins+1);for(const value of values){const bin=value===max?bins:Math.floor(value/step);if(bin>=0&&bin<=bins)counts[bin]++;}
 const accepted=[];for(let i=0;i<counts.length;i++)if(strict?counts[i]>count:counts[i]>=count)accepted.push(i);
 return Uint8Array.from(values,value=>accepted.some(i=>value>=i*step&&value<=(i+1)*step));
}
function adaptiveDbscan(coords,k){
 const n=coords.length/2;if(!n)return {labels:new Int32Array(),epsilon:0};let minX=0,maxX=0,minY=0,maxY=0;
 // Origin participates in the author's automatic radius estimate, but is not
 // a scientific correspondence and is removed from the returned labels.
 for(let i=0;i<n;i++){minX=Math.min(minX,coords[i*2]);maxX=Math.max(maxX,coords[i*2]);minY=Math.min(minY,coords[i*2+1]);maxY=Math.max(maxY,coords[i*2+1]);}
 const epsilon=Math.sqrt((maxX-minX)*(maxY-minY)*k/((n+1)*Math.PI)),data=new Float64Array(coords.length+2);data.set(coords);
 const labels=new Int32Array(n+1),visited=new Uint8Array(n+1),tree=new NearestIndex(data,2,Array.from({length:n+1},(_,i)=>i));let number=0;
 const neighbors=i=>tree.range(i,epsilon);
 for(let i=0;i<n+1;i++){
  if(visited[i])continue;visited[i]=1;const seeds=neighbors(i);if(seeds.length<k+1){labels[i]=-1;continue;}number++;labels[i]=number;const queued=new Uint8Array(n+1);for(const j of seeds)queued[j]=1;
  for(let index=0;index<seeds.length;index++){const j=seeds[index];if(!visited[j]){visited[j]=1;const near=neighbors(j);if(near.length>=k+1)for(const q of near)if(!queued[q]){queued[q]=1;seeds.push(q);}}if(labels[j]<=0)labels[j]=number;}
 }
 return {labels:labels.subarray(0,n),epsilon};
}

export async function ssgFilterMatches(features,phraseMatches,{width,height,...input}={},hooks={}){
 checkAbort(hooks.signal);
 const p=ssgParams(input),n=validateFeatures(features);typed(phraseMatches.pairs,2,'Invalid SSG phrase matches.');requireValue(phraseMatches.pairs.every(x=>Number.isInteger(x)&&x>=0&&x<n)&&Number.isSafeInteger(width)&&width>0&&Number.isSafeInteger(height)&&height>0,'Invalid SSG phase filtering input.');
 const count=phraseMatches.pairs.length/2;admit(hooks,count*160);const angles=[],lengths=[],deltas=[];
 for(let i=0;i<count;i++){
  const a=phraseMatches.pairs[i*2],b=phraseMatches.pairs[i*2+1];let dx=features.points[a*3]-features.points[b*3],dy=features.points[a*3+1]-features.points[b*3+1];if(dy<0){dx=-dx;dy=-dy;}angles.push(Math.atan2(dy,dx)*180/Math.PI);lengths.push(Math.hypot(dx,dy));deltas.push([dx,dy]);
 }
 const angular=histogramKeep(angles,p.angularBins,180,p.minimumBinCount,true),first=[];for(let i=0;i<count;i++)if(angular[i])first.push(i);
 const radial=histogramKeep(first.map(i=>lengths[i]),p.distanceBins,Math.floor(Math.hypot(width,height)),p.minimumBinCount,true),retained=first.filter((_,i)=>radial[i]),coords=Float64Array.from(retained.flatMap(i=>deltas[i])),cluster=adaptiveDbscan(coords,p.clusterNeighbors),cooperate=createCooperator(hooks.signal),rows=[];const groupMap=new Map();
 for(let i=0;i<retained.length;i++)if(cluster.labels[i]>0){const key=cluster.labels[i];if(!groupMap.has(key))groupMap.set(key,[]);groupMap.get(key).push(i);}
 for(const [label,indices] of groupMap){
  await cooperate();const phases=indices.map(index=>{const row=retained[index],a=phraseMatches.pairs[row*2],b=phraseMatches.pairs[row*2+1];let sum=0;for(let d=0;d<12;d++){const ar=features.moments[a*24+d*2],ai=features.moments[a*24+d*2+1],br=features.moments[b*24+d*2],bi=features.moments[b*24+d*2+1];if(br===0&&bi===0)return NaN;sum+=Math.atan2(ai*br-ar*bi,ar*br+ai*bi)/(1+Math.floor(d/4));}return Math.abs(sum/12);});
  const step=Math.PI/p.angularBins,hist=new Uint32Array(p.angularBins+1);for(const phase of phases)if(Number.isFinite(phase))hist[Math.min(p.angularBins,Math.floor(phase/step))]++;const top=Array.from({length:hist.length},(_,i)=>i).sort((a,b)=>hist[b]-hist[a]||a-b).slice(0,2).filter(i=>hist[i]>=p.minimumBinCount);
  for(let i=0;i<indices.length;i++)if(top.some(bin=>phases[i]>=bin*step&&phases[i]<=(bin+1)*step)){const row=retained[indices[i]];rows.push([phraseMatches.pairs[row*2],phraseMatches.pairs[row*2+1],row,label]);}
 }
 return {pairs:Uint32Array.from(rows.flatMap(x=>x.slice(0,2))),phraseRows:Uint32Array.from(rows.map(x=>x[2])),clusters:Int32Array.from(rows.map(x=>x[3])),epsilon:cluster.epsilon,parameters:p,reference:SSG_REFERENCE};
}

export function requireSsgDetectorDependencies(dependencies={}){
 const missing=['vlfeatSift','structuredEdges','rstMlesac','ssimRoiLocalization'].filter(name=>typeof dependencies[name]!=='function');
 if(missing.length)throw new EngineError('UNSUPPORTED_OPERATION','The full SSG detector is not yet available; its verified numerical core is separate.',{details:{method:'SSG',missing,reference:SSG_REFERENCE}});
 return dependencies;
}
