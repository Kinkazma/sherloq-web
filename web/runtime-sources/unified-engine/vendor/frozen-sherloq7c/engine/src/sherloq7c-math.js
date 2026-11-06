// Sherloq 7C — native 16-bit input, binary64 graph and Newton/PCG target.
// The algorithm, graph and objective match the frozen Python research model.
// No output approximation is labelled bit-identical without a measured proof.
const failure=(code,message,details)=>Object.assign(new Error(message),{code,details});
const check=signal=>{if(signal?.aborted)throw failure('CANCELLED','Task cancelled.');};
// Task checkpoints have the same8ms work cadence and cancellation checks.
// A fresh channel is closed before resolving; no idle port/pool survives a
// checkpoint, and nested timer clamping cannot add a4ms latency per yield.
export function cooperator(signal){let next=performance.now()+8;return async()=>{check(signal);if(performance.now()>=next){await new Promise(resolve=>{if(typeof MessageChannel!=='function'){setTimeout(resolve,0);return;}const channel=new MessageChannel();channel.port1.onmessage=()=>{channel.port1.close();channel.port2.close();resolve();};channel.port2.postMessage(0);});check(signal);next=performance.now()+8;}};}
export function allocate7c(Type,length,label='Sherloq typed array'){
 if(!Number.isSafeInteger(length)||length<0)throw failure('INVALID_INPUT','Invalid typed-array extent.');
 try{return new Type(length);}catch(cause){if(!(cause instanceof RangeError))throw cause;throw Object.assign(new Error('Unable to allocate '+label+'.',{cause}),{code:'MEMORY_ALLOCATION',details:{allocationKind:'array-buffer',requestedBytes:length*Type.BYTES_PER_ELEMENT,label}});}
}
export function copy7c(source,begin=0,end=source.length){const out=allocate7c(source.constructor,end-begin,'Sherloq owned copy');out.set(source.subarray(begin,end));return out;}
const offsets=[[0,1,1],[1,0,1],[1,1,Math.SQRT1_2],[1,-1,Math.SQRT1_2]];
const nativeLittleEndian=new Uint32Array(new Float64Array([1]).buffer)[1]===0x3ff00000;
// Positive finite IEEE754 keys have the same bit and numeric order. Stable
// byte-radix passes preserve ties and yield control between bounded batches.
export async function radixPositiveIndices(values,cooperate){
 const n=values.length,bytes=new Uint8Array(values.buffer,values.byteOffset,n*8),counts=allocate7c(Uint32Array,256);let a=allocate7c(Uint32Array,n),b=allocate7c(Uint32Array,n);
 for(let i=0;i<n;i++)a[i]=i;
 for(let pass=0;pass<8;pass++){
  const lane=nativeLittleEndian?pass:7-pass;counts.fill(0);
  for(let i=0;i<n;i++){counts[bytes[a[i]*8+lane]]++;if((i&65535)===0)await cooperate();}
  let nonempty=0;for(let j=0;j<256;j++)if(counts[j])nonempty++;if(nonempty<=1)continue;
  let sum=0;for(let j=0;j<256;j++){const value=counts[j];counts[j]=sum;sum+=value;}
  for(let i=0;i<n;i++){const index=a[i];b[counts[bytes[index*8+lane]]++]=index;if((i&65535)===0)await cooperate();}
  const t=a;a=b;b=t;
 }return a;
}

// Pair keys encode (lowComponent, highComponent). Group first by the integer
// low component, then stably order each small adjacency list. Equal pairs keep
// the original edge order, including the order of Float64 weight additions.
export async function orderPairCodes7c(codes,n,cooperate){
 const E=codes.length,offset=allocate7c(Uint32Array,n+1),order=allocate7c(Uint32Array,E);
 let work=0;
 for(let i=0;i<E;i++){offset[Math.floor(codes[i]/n)+1]++;if((i&65535)===0)await cooperate();}
 let longest=0;for(let i=0;i<n;i++){longest=Math.max(longest,offset[i+1]);offset[i+1]+=offset[i];if((i&65535)===0)await cooperate();}
 for(let i=0;i<E;i++){order[offset[Math.floor(codes[i]/n)]++]=i;if((i&65535)===0)await cooperate();}
 for(let i=n;i>0;i--)offset[i]=offset[i-1];offset[0]=0;
 const scratch=longest>32?allocate7c(Uint32Array,longest):null;
 for(let row=0;row<n;row++){
  const begin=offset[row],end=offset[row+1],length=end-begin;
  if(length<=32){
   for(let i=begin+1;i<end;i++){const index=order[i],key=codes[index];let j=i;while(j>begin&&codes[order[j-1]]>key){order[j]=order[j-1];j--;}order[j]=index;}
  }else{
   const destination=order.subarray(begin,end);let a=destination,b=scratch.subarray(0,length);
   for(let width=1;width<length;width*=2){
    for(let left=0;left<length;left+=width*2){
     const middle=Math.min(length,left+width),right=Math.min(length,left+width*2);let i=left,j=middle;
     for(let at=left;at<right;at++){
      b[at]=i<middle&&(j>=right||codes[a[i]]<=codes[a[j]])?a[i++]:a[j++];
      if(++work===65536){work=0;await cooperate();}
     }
    }
    const swap=a;a=b;b=swap;
   }
   if(a!==destination)destination.set(a);
  }
  if((row&4095)===0)await cooperate();
 }
 return order;
}

export async function prepare7cNative16({width,height,data}, {signal,onProgress}={}){
 if(!Number.isSafeInteger(width)||!Number.isSafeInteger(height)||width<1||height<1||!(data instanceof Uint16Array)||data.length!==width*height*3)throw failure('INVALID_INPUT','Sherloq requires an owned RGB16 image.');
 const start=performance.now(),N=width*height,cooperate=cooperator(signal),x=allocate7c(Float64Array,N),parent=allocate7c(Uint32Array,N),sizes=allocate7c(Uint32Array,N);
 for(let i=0;i<N;i++){x[i]=Math.max(data[3*i],data[3*i+1],data[3*i+2])/65535;parent[i]=i;sizes[i]=1;if((i&65535)===0)await cooperate();}
 const find=i=>{while(parent[i]!==i){parent[i]=parent[parent[i]];i=parent[i];}return i;};
 for(const [dy,dx] of offsets)for(let y=0;y<height-dy;y++){
  for(let xx=Math.max(0,-dx);xx<width-Math.max(0,dx);xx++){
   const a=y*width+xx,b=(y+dy)*width+xx+dx;
   if(x[a]===x[b]){let ra=find(a),rb=find(b);if(ra!==rb){if(sizes[ra]<sizes[rb]){const t=ra;ra=rb;rb=t;}parent[rb]=ra;sizes[ra]+=sizes[rb];}}
   if(xx>0&&(xx&65535)===0)await cooperate();
  }if((y&31)===0)await cooperate();
 }
 const roots=allocate7c(Int32Array,N);roots.fill(-1);const labels=allocate7c(Uint32Array,N);let count=0;
 for(let i=0;i<N;i++){const r=find(i);if(roots[r]<0)roots[r]=count++;labels[i]=roots[r];if((i&65535)===0)await cooperate();}
 // Components are numbered by their first source pixel, as in scipy's graph.
 const levels=allocate7c(Float64Array,count),nativeLevels=allocate7c(Uint16Array,count),counts=allocate7c(Float64Array,count),area=allocate7c(Float64Array,count);
 for(let i=0;i<N;i++){levels[labels[i]]=x[i];nativeLevels[labels[i]]=Math.max(data[3*i],data[3*i+1],data[3*i+2]);counts[labels[i]]++;if((i&65535)===0)await cooperate();}for(let i=0;i<count;i++)area[i]=counts[i]/N;
 if(count*count>Number.MAX_SAFE_INTEGER)throw failure('NUMERIC_RANGE','Graph pair keys exceed exact safe-integer addressing.');
 let E=0;for(const [dy,dx]of offsets)E+=(height-dy)*(width-Math.abs(dx));
 const codes=allocate7c(Float64Array,E),weights=allocate7c(Float64Array,E);let used=0;
 for(const [dy,dx,w] of offsets)for(let y=0;y<height-dy;y++){
  for(let xx=Math.max(0,-dx);xx<width-Math.max(0,dx);xx++){
   const a=y*width+xx,b=(y+dy)*width+xx+dx;
   if(x[a]!==x[b]){const low=x[a]<x[b]?labels[a]:labels[b],high=x[a]<x[b]?labels[b]:labels[a];codes[used]=low*count+high;weights[used++]=w;}
   if(xx>0&&(xx&65535)===0)await cooperate();
  }if((y&31)===0)await cooperate();
 }
 const indices=await orderPairCodes7c(codes.subarray(0,used),count,cooperate);
 let edges=0,last=-1;for(let k=0;k<indices.length;k++){const i=indices[k];if(codes[i]!==last){last=codes[i];edges++;}if((k&65535)===0)await cooperate();}
 const low=allocate7c(Uint32Array,edges),high=allocate7c(Uint32Array,edges),difference=allocate7c(Float64Array,edges),multiplicity=allocate7c(Float64Array,edges);last=-1;let at=-1;
 for(let k=0;k<used;k++){const i=indices[k],code=codes[i];if(code!==last){last=code;at++;low[at]=Math.floor(code/count);high[at]=code-low[at]*count;difference[at]=levels[high[at]]-levels[low[at]];}multiplicity[at]+=weights[i];if((k&65535)===0)await cooperate();}
 const ordered=await radixPositiveIndices(difference,cooperate);
 let total=0;for(let j=0;j<edges;j++){total+=multiplicity[ordered[j]];if((j&65535)===0)await cooperate();}let mass=0,median=0,weakScale=0;
 for(let j=0;j<edges;j++){const i=ordered[j];mass+=multiplicity[i];if(!weakScale&&mass>=.01*total)weakScale=difference[i];if(mass>=.5*total){median=difference[i];break;}}
 const p={width,height,source:x,labels,levels,nativeLevels,counts,area,low,high,difference,multiplicity,median,weakScale,sourceMin:Infinity,sourceMax:-Infinity};
 for(let i=0;i<levels.length;i++){const v=levels[i];p.sourceMin=Math.min(p.sourceMin,v);p.sourceMax=Math.max(p.sourceMax,v);if((i&65535)===0)await cooperate();}
 p.preparationMs=performance.now()-start;p.ownedBytes=[x,labels,levels,nativeLevels,counts,area,low,high,difference,multiplicity].reduce((a,v)=>a+v.byteLength,0);
 onProgress?.({phase:'sherloq-prepare',fraction:1,components:count,edges});return p;
}

export function baseline7c(p){const y=allocate7c(Float64Array,p.levels.length),span=p.sourceMax-p.sourceMin;for(let i=0;i<y.length;i++)y[i]=span?(p.levels[i]-p.sourceMin)/span:p.levels[i];return y;}
export function initial7c(p){
 const levels=p.nativeLevels??Uint16Array.from(p.levels,v=>Math.round(v*65535)),present=allocate7c(Uint8Array,65536),rank=allocate7c(Float64Array,65536);let unique=0;
 for(const v of levels)if(!present[v]){present[v]=1;unique++;}let at=0;for(let i=0;i<65536;i++)if(present[i])rank[i]=at++/(unique-1);
 const y=allocate7c(Float64Array,levels.length);for(let i=0;i<y.length;i++)y[i]=.1*p.levels[i]+.9*(.01+.98*rank[levels[i]]);return y;
}

export async function strictTargetSeed7c(p,values,{signal}={}){
 const cooperate=cooperator(signal),n=p.levels.length,E=p.low.length;
 let feasible=true;for(let i=0;i<n;i++)if(!(values[i]>0&&values[i]<1)){feasible=false;break;}if(feasible)for(let e=0;e<E;e++)if(!(values[p.high[e]]-values[p.low[e]]>.1*p.difference[e])){feasible=false;break;}if(feasible)return values;
 const base=initial7c(p),epsilon=.01;
 const histogram=allocate7c(Uint32Array,65537),order=allocate7c(Uint32Array,n),outOffsets=allocate7c(Uint32Array,n+1),outOrder=allocate7c(Uint32Array,E);
 for(let i=0;i<n;i++)histogram[(p.nativeLevels?.[i]??Math.round(p.levels[i]*65535))+1]++;
 for(let i=1;i<histogram.length;i++)histogram[i]+=histogram[i-1];
 for(let i=0;i<n;i++)order[histogram[p.nativeLevels?.[i]??Math.round(p.levels[i]*65535)]++]=i;
 for(let e=0;e<E;e++)outOffsets[p.low[e]+1]++;for(let i=0;i<n;i++)outOffsets[i+1]+=outOffsets[i];const cursor=copy7c(outOffsets,0,n);
 for(let e=0;e<E;e++)outOrder[cursor[p.low[e]]++]=e;
 const upper=allocate7c(Float64Array,n),z=copy7c(values);for(let i=0;i<n;i++)upper[i]=1-epsilon*(1-base[i]);
 const margin=e=>{const l=p.low[e],h=p.high[e],floor=.1*p.difference[e];return floor+epsilon*(base[h]-base[l]-floor);};
 for(let k=n-1;k>=0;k--){const i=order[k];for(let a=outOffsets[i];a<outOffsets[i+1];a++){const e=outOrder[a];upper[i]=Math.min(upper[i],upper[p.high[e]]-margin(e));}if((k&1023)===0)await cooperate();}
 for(let i=0;i<n;i++)z[i]=Math.max(epsilon*base[i],Math.min(upper[i],z[i]));
 for(let k=0;k<n;k++){const i=order[k];for(let a=outOffsets[i];a<outOffsets[i+1];a++){const e=outOrder[a],h=p.high[e];z[h]=Math.max(z[h],z[i]+margin(e));}if((k&1023)===0)await cooperate();}
 for(let e=0;e<E;e++)if(!(z[p.high[e]]-z[p.low[e]]>.1*p.difference[e]))return base;
 return z;
}

export async function solveTarget7c(p,micro,{signal,onProgress,tolerance=2e-4,maxIterations=240,initial,maxError=null}={}){
 if(!(micro>=0&&micro<=1))throw failure('INVALID_INPUT','Microcontrast must be normalized.');
 const started=performance.now(),n=p.levels.length,E=p.low.length,cooperate=cooperator(signal),{low,high,difference:d,area}=p;
 if(!E)return {z:copy7c(p.levels),metrics:{converged:true,constant:true,elapsedMs:performance.now()-started,rmsErrorBound:0,maxErrorBound:0,iterations:0}};
 const w=allocate7c(Float64Array,E),floor=allocate7c(Float64Array,E),target=allocate7c(Float64Array,E),fidelity=allocate7c(Float64Array,E),curvature=allocate7c(Float64Array,E),slack=allocate7c(Float64Array,E);
 const g=allocate7c(Float64Array,n),diag=allocate7c(Float64Array,n),hdiag=allocate7c(Float64Array,n),step=allocate7c(Float64Array,n),r=allocate7c(Float64Array,n),zpcg=allocate7c(Float64Array,n),direction=allocate7c(Float64Array,n),product=allocate7c(Float64Array,n),trial=allocate7c(Float64Array,n);
 const gain=Math.max(4*16**micro,(.5+7.5*micro)/(255*p.weakScale));let weightSum=0;
 for(let e=0;e<E;e++){w[e]=p.multiplicity[e]*Math.sqrt(d[e]/(d[e]+p.median));weightSum+=w[e];floor[e]=.1*d[e];target[e]=gain*d[e]/(1+(gain-1)*d[e]);if((e&65535)===0)await cooperate();}
 for(let e=0;e<E;e++){w[e]/=weightSum;fidelity[e]=20*w[e]/(1+(d[e]/(8*p.weakScale))**4)/(target[e]*target[e]);}
 let y=initial?copy7c(initial):undefined;
 if(!y)y=initial7c(p);
 function objective(v){let value=0;for(let i=0;i<n;i++){if(!(v[i]>0&&v[i]<1))return Infinity;value-=.1*area[i]*(Math.log(v[i])+Math.log1p(-v[i]));}for(let e=0;e<E;e++){const delta=v[high[e]]-v[low[e]],s=delta-floor[e];if(!(s>0))return Infinity;const err=delta-target[e];value+=-w[e]*Math.log(s)+.5*fidelity[e]*err*err;}return value;}
 function multiply(v,out){for(let i=0;i<n;i++)out[i]=diag[i]*v[i];for(let e=0;e<E;e++){const lo=low[e],hi=high[e],q=curvature[e]*(v[hi]-v[lo]);out[hi]+=q;out[lo]-=q;}}
 let rmsBound=Infinity,maxBound=Infinity,cgIterations=0,iteration=0,converged=false,value=objective(y),lastReported=-1;
 if(!Number.isFinite(value))throw failure('INVALID_INPUT','Initial iterate is not feasible.');
 for(;iteration<=maxIterations;iteration++){
  for(let i=0;i<n;i++){g[i]=.1*area[i]*(-1/y[i]+1/(1-y[i]));diag[i]=.1*area[i]*(1/(y[i]*y[i])+1/((1-y[i])*(1-y[i])));hdiag[i]=diag[i];}
  for(let e=0;e<E;e++){const lo=low[e],hi=high[e],delta=y[hi]-y[lo];slack[e]=delta-floor[e];const force=-w[e]/slack[e]+fidelity[e]*(delta-target[e]);g[hi]+=force;g[lo]-=force;curvature[e]=w[e]/(slack[e]*slack[e])+fidelity[e];hdiag[hi]+=curvature[e];hdiag[lo]+=curvature[e];if((e&131071)===0)await cooperate();}
  let norm=0;maxBound=0;for(let i=0;i<n;i++){
   norm+=g[i]*g[i]/area[i];const linear=Math.abs(g[i])/(.8*area[i]),h=-1/y[i]+1/(1-y[i]),t=h-g[i]/(.1*area[i]);
   const inverse=t>=0?1-2/(2+t+Math.hypot(t,2)):2/(2-t+Math.hypot(t,2));
   maxBound=Math.max(maxBound,Math.min(linear,Math.abs(y[i]-inverse)+64*Number.EPSILON));
  }rmsBound=Math.sqrt(norm)/.8;
  if(maxError===null?rmsBound<=tolerance:maxBound<=maxError){converged=true;break;}if(iteration===maxIterations)break;
  step.fill(0);let rz=0,bnorm=0;
  for(let i=0;i<n;i++){r[i]=-g[i];zpcg[i]=r[i]/hdiag[i];direction[i]=zpcg[i];rz+=r[i]*zpcg[i];bnorm+=g[i]*g[i];}
  const relative=Math.min(.1,Math.max(1e-8,rmsBound*.01)),cgTolerance=relative*relative*bnorm;
  for(let it=0;it<2000;it++){
   multiply(direction,product);let denominator=0;for(let i=0;i<n;i++)denominator+=direction[i]*product[i];if(!(denominator>0))break;
   const alpha=rz/denominator;let rr=0;for(let i=0;i<n;i++){step[i]+=alpha*direction[i];r[i]-=alpha*product[i];rr+=r[i]*r[i];}cgIterations++;
   if(rr<=cgTolerance)break;let rzNext=0;for(let i=0;i<n;i++){zpcg[i]=r[i]/hdiag[i];rzNext+=r[i]*zpcg[i];}const beta=rzNext/rz;for(let i=0;i<n;i++)direction[i]=zpcg[i]+beta*direction[i];rz=rzNext;if((it&3)===0)await cooperate();
  }
  let directional=0;for(let i=0;i<n;i++)directional+=g[i]*step[i];
  if(!(directional<0)){directional=0;for(let i=0;i<n;i++){step[i]=-g[i]/hdiag[i];directional+=g[i]*step[i];}}
  let rate=1;
  for(let i=0;i<n;i++){if(step[i]<0)rate=Math.min(rate,-.99*y[i]/step[i]);if(step[i]>0)rate=Math.min(rate,.99*(1-y[i])/step[i]);}
  for(let e=0;e<E;e++){const q=step[high[e]]-step[low[e]];if(q<0)rate=Math.min(rate,-.99*slack[e]/q);}
  let accepted=false;for(let back=0;back<55;back++){for(let i=0;i<n;i++)trial[i]=y[i]+rate*step[i];const next=objective(trial);if(next<=value+1e-4*rate*directional){value=next;accepted=true;break;}rate*=.5;await cooperate();}
  if(!accepted)break;y.set(trial);await cooperate();
  if(iteration-lastReported>=5){onProgress?.({phase:'sherloq-target',micro,iteration,rmsErrorBound:rmsBound,maxErrorBound:maxBound});lastReported=iteration;}
 }
 const metrics={converged,elapsedMs:performance.now()-started,iterations:iteration,cgIterations,rmsErrorBound:rmsBound,maxErrorBound:maxBound,objective:value,gain,micro,backend:'cpu-js-f64'};
 if(!converged)throw failure('NUMERIC_CONVERGENCE','Sherloq target did not meet its declared precision.',metrics);
 return {z:y,metrics};
}

export function expand7c(p,z){const out=allocate7c(Float64Array,p.source.length);for(let i=0;i<out.length;i++)out[i]=z[p.labels[i]];return out;}
export function linked7cNative16(input,p,z){
 const N=p.source.length,scalar=allocate7c(Float64Array,N),pixels16=allocate7c(Uint16Array,3*N),pixels=allocate7c(Uint8Array,3*N);
 for(let i=0;i<N;i++){const y=z[p.labels[i]],v=p.source[i];scalar[i]=v?y:0;const gain=v?y/v:0;for(let c=0;c<3;c++){const value=input.data[3*i+c]*gain;pixels16[3*i+c]=Math.max(0,Math.min(65535,Math.round(value)));pixels[3*i+c]=Math.max(0,Math.min(255,Math.round(value/257)));}}
 return {width:input.width,height:input.height,pixels,pixels16,scalar,bitDepth:16};
}

export async function linked7cNative16Cooperative(input,p,z,{signal,onProgress}={}){
 const N=p.source.length,scalar=allocate7c(Float64Array,N),pixels16=allocate7c(Uint16Array,3*N),pixels=allocate7c(Uint8Array,3*N),cooperate=cooperator(signal);
 for(let i=0;i<N;i++){const y=z[p.labels[i]],v=p.source[i];scalar[i]=v?y:0;const gain=v?y/v:0;for(let c=0;c<3;c++){const value=input.data[3*i+c]*gain;pixels16[3*i+c]=Math.max(0,Math.min(65535,Math.round(value)));pixels[3*i+c]=Math.max(0,Math.min(255,Math.round(value/257)));}if((i&16383)===0)await cooperate();}
 onProgress?.({phase:'sherloq-rgb16',fraction:1});return {width:input.width,height:input.height,pixels,pixels16,scalar,bitDepth:16};
}

// The exact 0/0 contract needs global extrema and two linear passes only.
// Constructing equality components/edges/solvers here would be wasted work.
export async function stretch7cNative16(input,{signal,onProgress}={}){
 const N=input.width*input.height,data=input.data,cooperate=cooperator(signal);let minimum=65535,maximum=0;
 for(let i=0;i<N;i++){const value=Math.max(data[3*i],data[3*i+1],data[3*i+2]);minimum=Math.min(minimum,value);maximum=Math.max(maximum,value);if((i&16383)===0)await cooperate();}
 const a=minimum/65535,span=maximum/65535-a,scalar=allocate7c(Float64Array,N),pixels16=allocate7c(Uint16Array,3*N),pixels=allocate7c(Uint8Array,3*N);
 for(let i=0;i<N;i++){const v=Math.max(data[3*i],data[3*i+1],data[3*i+2])/65535,y=span?(v-a)/span:v,gain=v?y/v:0;scalar[i]=v?y:0;for(let c=0;c<3;c++){const value=data[3*i+c]*gain;pixels16[3*i+c]=Math.max(0,Math.min(65535,Math.round(value)));pixels[3*i+c]=Math.max(0,Math.min(255,Math.round(value/257)));}if((i&16383)===0)await cooperate();}
 onProgress?.({phase:'sherloq-stretch',fraction:1});return {width:input.width,height:input.height,pixels,pixels16,scalar,bitDepth:16};
}
