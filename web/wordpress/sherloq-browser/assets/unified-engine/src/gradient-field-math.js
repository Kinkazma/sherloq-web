import "../../runtime-context.js?v=0.33.0";
import {nativeGradientField} from './gradient-field-parameters.js';
// Independent numerical operators. Coordinates x right, y down; signed vectors
// point to increasing luminance. Missing observations never become black taps.
const cache=new Map();
export function gaussianWeights(size,sigma){const r=(size-1)/2,g=Float64Array.from({length:size},(_,i)=>Math.exp(-.5*((i-r)/sigma)**2)),sum=g.reduce((a,b)=>a+b,0);return g.map(v=>v/sum);}
const normal=v=>{const s=v.reduce((a,b)=>a+b,0);return v.map(x=>x/s);};
function binomial(n){let v=[1];for(let i=0;i<n;i++){const w=Array(v.length+1).fill(0);v.forEach((x,j)=>{w[j]+=x;w[j+1]+=x;});v=w;}return v;}
function quarter(a,b,r){a=Math.min(Math.abs(a),r);b=Math.min(Math.abs(b),r);const t=Math.sqrt(Math.max(0,r*r-b*b)),s=Math.min(a,t),F=x=>.5*(x*Math.sqrt(Math.max(0,r*r-x*x))+r*r*Math.asin(Math.min(1,x/r)));return b*s+(a>t?F(a)-F(t):0);}
export function diskArea(x,y,r){const Q=(a,b)=>Math.sign(a)*Math.sign(b)*quarter(a,b,r);return Math.max(0,Q(x+.5,y+.5)-Q(x-.5,y+.5)-Q(x+.5,y-.5)+Q(x-.5,y-.5));}
export function gradientKernel(p){
 const key=JSON.stringify([p.method,p.kernelSize,p.sampleStep,p.sigma,p.diskFill]);if(cache.has(key))return cache.get(key);
 const n=p.kernelSize,r=(n-1)/2;let smooth,derivative,taps=[];
 if(p.method==='central'){smooth=[0,1,0];derivative=[-.5,0,.5];}
 if(p.method==='prewitt'){smooth=Array(n).fill(1/n);derivative=Array.from({length:n},(_,i)=>(i-r)/Array.from({length:n},(_,j)=>(j-r)**2).reduce((a,b)=>a+b,0));}
 if(p.method==='sobel'){smooth=normal(binomial(n-1));const a=binomial(n-3),d=Array(n).fill(0);a.forEach((v,i)=>{d[i]-=v;d[i+2]+=v;});const m=d.reduce((s,v,i)=>s+v*(i-r),0);derivative=d.map(v=>v/m);}
 if(p.method==='scharr'){smooth=[3/16,10/16,3/16];derivative=[-.5,0,.5];}
 if(p.method==='farid'){
  smooth=n===5?[.0376593171958126,.249153396177344,.426374573253687,.249153396177344,.0376593171958126]:[.004711,.069321,.245410,.361117,.245410,.069321,.004711];
  derivative=n===5?[-.109603762960254,-.276690988455557,0,.276690988455557,.109603762960254]:[-.018708,-.125376,-.193091,0,.193091,.125376,.018708];
 }
 if(p.method==='gaussian'){smooth=[...gaussianWeights(n,p.sigma)];const m=smooth.reduce((s,v,i)=>s+v*(i-r)**2,0);derivative=smooth.map((v,i)=>(i-r)*v/m);}
 if(smooth)for(let y=0;y<n;y++)for(let x=0;x<n;x++){const kx=smooth[y]*derivative[x]/p.sampleStep,ky=derivative[y]*smooth[x]/p.sampleStep;if(kx||ky)taps.push([(x-r)*p.sampleStep,(y-r)*p.sampleStep,kx,ky]);}
 if(p.method==='disk'){
  const radius=n*.5*p.diskFill;let moment=0;
  for(let y=-r;y<=r;y++)for(let x=-r;x<=r;x++){const w=diskArea(Math.abs(x),Math.abs(y),radius);taps.push([x*p.sampleStep,y*p.sampleStep,w*x,w*y]);moment+=w*x*x;}
  taps=taps.filter(t=>t[2]||t[3]).map(([x,y,a,b])=>[x,y,moment?a/moment/p.sampleStep:0,moment?b/moment/p.sampleStep:0]);
 }
 if(p.method==='krawetz')for(let y=-1;y<=1;y++)for(let x=-1;x<=1;x++)if(x||y){const weight=x&&y?4:7;taps.push([x*p.sampleStep,y*p.sampleStep,x*weight/30/p.sampleStep,y*weight/30/p.sampleStep]);}
 const out={taps,xPairs:taps.filter(t=>t[0]>0&&t[2]),yPairs:taps.filter(t=>t[1]>0&&t[3]),smooth,derivative,step:p.sampleStep,radius:r*p.sampleStep};
 if(cache.size>=32)cache.delete(cache.keys().next().value);cache.set(key,out);return out;
}
export function boundary(i,n,mode){if(i>=0&&i<n)return i;if(mode==='omit')return -1;if(mode==='nearest')return Math.max(0,Math.min(n-1,i));if(n===1)return 0;let j=i%(2*n);if(j<0)j+=2*n;return j<n?j:2*n-1-j;}
export function grayInput(rgb,membership,p){
 const n=rgb.length/3,L=new Float64Array(n),M=membership??new Uint8Array(n).fill(1),integerSobel=nativeGradientField(p)&&p.method==='sobel',linear=x=>x<=.04045?x/12.92:((x+.055)/1.055)**2.4;
 for(let i=0;i<n;i++)if(M[i]){const r=rgb[3*i],g=rgb[3*i+1],b=rgb[3*i+2];L[i]=integerSobel?((r*9798+g*19235+b*3735+16384)>>15)/255:p.method==='krawetz'&&p.luma==='bt601'?Math.floor((299*r+587*g+114*b)/1000)/255:p.luma==='linear709'?.2126*linear(r/255)+.7152*linear(g/255)+.0722*linear(b/255):(.299*r+.587*g+.114*b)/255;}
 return{L,M};
}
export function convolveAxis(input,w,h,weights,axis,border='reflect',step=1){
 const out=new Float64Array(input.length),r=(weights.length-1)/2;
 // Interior taps have no boundary lookup. Preserve their summation order and
 // retain the exact same physical-boundary rule at the short edge bands.
 const radius=r*step,stride=axis?w*step:step;
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){let sum=0;const position=axis?y:x,limit=axis?h:w;
  if(position>=radius&&position<limit-radius){const first=y*w+x-r*stride;for(let k=0;k<weights.length;k++)sum+=weights[k]*input[first+k*stride];}
  else for(let k=0;k<weights.length;k++){const v=boundary(position+(k-r)*step,limit,border);if(v>=0)sum+=weights[k]*input[axis?v*w+x:y*w+v];}
  out[y*w+x]=sum;
 }return out;
}
export const convolve2=(input,w,h,x,y,border='reflect',step=1)=>convolveAxis(convolveAxis(input,w,h,x,0,border,step),w,h,y,1,border,step);
export function prefilter(L,M,w,h,p){if(!p.preSigma)return L;const g=gaussianWeights(p.preSize,p.preSigma),num=convolve2(L,w,h,g,g,p.border),mass=convolve2(M,w,h,g,g,p.border);for(let i=0;i<L.length;i++)num[i]=M[i]&&mass[i]>0?num[i]/mass[i]:0;return num;}
export function derivativeBlock(L,M,w,h,p,{start=0,rows=h}={}){
 if(nativeGradientField(p))return historicalDerivativeBlock(L,M,w,h,p,{start,rows});
 const k=gradientKernel(p),out=new Float64Array(w*rows*2),full=M.every(v=>v===1);
 if(k.smooth&&full&&p.border!=='omit'){
  // Pair antisymmetric taps before smoothing: exact zero on constant data.
  const d=k.derivative,rr=(d.length-1)/2,step=k.step;
  const axis=axis=>{const a=new Float64Array(w*h);for(let y=0;y<h;y++)for(let x=0;x<w;x++){let s=0;for(let j=1;j<=rr;j++){const hi=boundary((axis?y:x)+j*step,axis?h:w,p.border),lo=boundary((axis?y:x)-j*step,axis?h:w,p.border);s+=d[rr+j]*(L[axis?hi*w+x:y*w+hi]-L[axis?lo*w+x:y*w+lo])/step;}a[y*w+x]=s;}return convolveAxis(a,w,h,k.smooth,axis?0:1,p.border,step);};
  const gx=axis(0),gy=axis(1);for(let i=0;i<w*rows;i++){out[2*i]=gx[start*w+i];out[2*i+1]=gy[start*w+i];}return out;
 }
 const ring=[[1,0],[1,1],[0,1],[-1,1],[-1,0],[-1,-1],[0,-1],[1,-1]],values=new Float64Array(8);
 const delta=(x,y,centre)=>{const xx=boundary(x,w,p.border),yy=boundary(y,h,p.border);return xx<0||yy<0||!M[yy*w+xx]?0:L[yy*w+xx]-centre;};
 for(let row=0;row<rows;row++)for(let x=0;x<w;x++){
  const y=start+row,at=y*w+x,target=(row*w+x)*2;if(!M[at])continue;const centre=L[at];let gx=0,gy=0;
  if(p.method==='kirsch'){
   for(let j=0;j<8;j++){const dx=ring[j][0],dy=ring[j][1],xx=boundary(x+dx*p.sampleStep,w,p.border),yy=boundary(y+dy*p.sampleStep,h,p.border);values[j]=xx<0||yy<0||!M[yy*w+xx]?0:L[yy*w+xx]-centre;}let best=0,which=0;
   for(let j=0;j<8;j++){let s=0;for(let i=0;i<8;i++)s+=values[i]*(i===(j+7)%8||i===j||i===(j+1)%8?5:-3);if(s>best){best=s;which=j;}}const magnitude=best/24/p.sampleStep*(which%2?Math.SQRT1_2:1);gx=magnitude*ring[which][0];gy=magnitude*ring[which][1];
  }else{
   // Pair each derivative along its own axis before transverse accumulation.
   // This retains exact zero in the other axis; per-channel RGB normalization
   // must never magnify a floating-point cancellation residual into a contour.
   for(const[dx,dy,kx]of k.xPairs)gx+=kx*(delta(x+dx,y+dy,centre)-delta(x-dx,y+dy,centre));
   for(const[dx,dy,,ky]of k.yPairs)gy+=ky*(delta(x+dx,y+dy,centre)-delta(x+dx,y-dy,centre));
  }
  out[target]=gx;out[target+1]=gy;
 }return out;
}
export function coherenceBlock(slopes,M,w,h,p){const a=new Float64Array(w*h),b=new Float64Array(w*h),c=new Float64Array(w*h),g=gaussianWeights(p.tensorSize,p.tensorSigma);for(let i=0;i<a.length;i++)if(M[i]){const x=slopes[2*i],y=slopes[2*i+1];a[i]=x*x;b[i]=x*y;c[i]=y*y;}const aa=convolve2(a,w,h,g,g,p.border),bb=convolve2(b,w,h,g,g,p.border),cc=convolve2(c,w,h,g,g,p.border),out=new Float64Array(w*h);for(let i=0;i<out.length;i++){const energy=aa[i]+cc[i];out[i]=M[i]&&energy>1e-24?Math.min(1,Math.hypot(aa[i]-cc[i],2*bb[i])/energy):0;}return out;}
export function angleInto(out,at,gx,gy,invert=false,maximumMagnitude=Math.hypot(gx,gy)){
 const magnitude=Math.hypot(gx,gy);if(magnitude<=1e-12||maximumMagnitude<=1e-12){out[at]=out[at+1]=out[at+2]=127;return;}
 const strength=Math.min(1,magnitude/maximumMagnitude),high=127+128*strength,low=high*(1-strength),h=(Math.atan2(invert?-gy:gy,invert?-gx:gx)/(2*Math.PI)+1)%1*6,i=Math.floor(h),f=h-i,up=Math.round(low+(high-low)*f),down=Math.round(high-(high-low)*f),hi=Math.round(high),lo=Math.round(low);
 switch(i%6){case 0:out[at]=hi;out[at+1]=up;out[at+2]=lo;break;case 1:out[at]=down;out[at+1]=hi;out[at+2]=lo;break;case 2:out[at]=lo;out[at+1]=hi;out[at+2]=up;break;case 3:out[at]=lo;out[at+1]=down;out[at+2]=hi;break;case 4:out[at]=up;out[at+1]=lo;out[at+2]=hi;break;default:out[at]=hi;out[at+1]=lo;out[at+2]=down;}
}
export function angleRgb(gx,gy,invert=false){const out=new Uint8Array(3);angleInto(out,0,gx,gy,invert);return[...out];}

// Native 3x3 coefficients, gray rounding and ROI extension retained for the
// existing operators; normalized uniformly only after each exact integer sum.
export function historicalDerivativeBlock(L,M,w,h,p,{start=0,rows=h}={}){
 const out=new Float64Array(w*rows*2),sobel=p.method==='sobel',edge=(i,n)=>{if(n===1)return 0;const period=2*n-2;let v=i%period;if(v<0)v+=period;return v<n?v:period-v;};
 for(let row=0;row<rows;row++)for(let x=0;x<w;x++){const y=start+row,at=y*w+x,target=2*(row*w+x);if(!M[at])continue;const centre=Math.round(L[at]*255);let gx=0,gy=0;
  for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){if(!dx&&!dy)continue;let sx=x+dx,sy=y+dy,value;
   if(sobel){sx=edge(sx,w);sy=edge(sy,h);if(!M[sy*w+sx]){sx=edge(x-dx,w);sy=edge(y-dy,h);if(!M[sy*w+sx]){sx=x;sy=y;}}value=Math.round(L[sy*w+sx]*255);gx+=dx*(dy===0?2:1)*value;gy+=dy*(dx===0?2:1)*value;}
   else{if(sx<0||sx>=w||sy<0||sy>=h||!M[sy*w+sx])continue;value=(Math.round(L[sy*w+sx]*255)-centre)*(dx&&dy?4:7);gx+=dx*value;gy+=dy*value;}
  }const scale=sobel?2040:7650;out[target]=gx/scale;out[target+1]=gy/scale;
 }return out;
}
export function gradientComponentStats(){return new Float64Array([0,0,Infinity,-Infinity,Infinity,-Infinity,0]);}
export function accumulateGradientComponents(stats,slopes,membership){for(let i=0;i<membership.length;i++)if(membership[i]){const x=Math.abs(slopes[2*i]),y=Math.abs(slopes[2*i+1]),m=x+y;stats[0]=Math.max(stats[0],x);stats[1]=Math.max(stats[1],y);stats[2]=Math.min(stats[2],m);stats[3]=Math.max(stats[3],m);stats[6]=Math.max(stats[6],Math.hypot(x,y));}return stats;}
const byte=v=>Math.max(0,Math.min(255,Math.trunc(v)));
export function componentInto(out,at,gx,gy,p,stats){
 if(p.invert){gx=-gx;gy=-gy;}
 if(p.method==='krawetz'){
  const magnitude=Math.hypot(gx,gy)*7650,angle=Math.atan2(gx,gy);out[at]=magnitude?byte((-Math.cos(angle)/2+.5)*255):127;out[at+1]=magnitude?byte((-Math.sin(angle)/2+.5)*255):127;out[at+2]=byte(magnitude/9);return;
 }
 const r=stats[0]>0?byte(127+gx/stats[0]*127):127,g=stats[1]>0?byte(127+gy/stats[1]*127):127;out[at]=r;out[at+1]=g;
 if(p.mode===0)out[at+2]=0;else if(p.mode===1)out[at+2]=255;else if(p.mode===3)out[at+2]=stats[5]>stats[4]?byte((Math.hypot(r,g)-stats[4])*255/(stats[5]-stats[4])):0;else out[at+2]=stats[3]>stats[2]?byte((Math.abs(gx)+Math.abs(gy)-stats[2])*255/(stats[3]-stats[2])):0;
}
