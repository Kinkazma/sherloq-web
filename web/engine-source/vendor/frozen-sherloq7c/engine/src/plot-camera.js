import {requireValue} from './errors.js';
export const PLOT_COLUMNS=Object.freeze(['Red','Green','Blue','Hue','Saturation','Value']);
export function plotStyle(input={}){
 const p={x:3,y:4,z:5,kind:'2d',colored:false,alpha:1,size:1,grid:true,...input};
 requireValue(['2d','3d','classic'].includes(p.kind)&&['x','y','z'].every(k=>Number.isInteger(p[k])&&p[k]>=0&&p[k]<6),'Invalid plot axes.');
 requireValue(Number.isFinite(p.alpha)&&p.alpha>=0&&p.alpha<=1&&Number.isFinite(p.size)&&p.size>=1&&p.size<=10,'Invalid plot point appearance.');return p;
}
export function plotCamera(input={}){
 const c={limits:[0,1,0,1],center:[.5,.5,.5],distance:3.5,elevation:25,azimuth:45,...input};
 requireValue(c.limits.length===4&&c.limits.every(Number.isFinite)&&c.limits[1]-c.limits[0]>=1e-6&&c.limits[3]-c.limits[2]>=1e-6,'Invalid plot limits.');
 requireValue(c.center.length===3&&c.center.every(Number.isFinite)&&Number.isFinite(c.distance)&&c.distance>.01&&Number.isFinite(c.elevation)&&Number.isFinite(c.azimuth),'Invalid plot camera.');return {...c,limits:[...c.limits],center:[...c.center]};
}
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const dot=(a,b)=>a.reduce((s,v,i)=>s+v*b[i],0);
const unit=a=>{const n=Math.hypot(...a);return a.map(v=>v/n);};
function multiply(a,b){const out=new Float32Array(16);for(let c=0;c<4;c++)for(let r=0;r<4;r++)for(let k=0;k<4;k++)out[c*4+r]+=a[k*4+r]*b[c*4+k];return out;}
export function plotMatrix(style,camera,aspect=1){
 if(style.kind!=='3d'){
  const [x0,x1,y0,y1]=camera.limits;return new Float32Array([2/(x1-x0),0,0,0,0,2/(y1-y0),0,0,0,0,0,0,-(x1+x0)/(x1-x0),-(y1+y0)/(y1-y0),0,1]);
 }
 const el=camera.elevation*Math.PI/180,az=camera.azimuth*Math.PI/180,z=[Math.cos(el)*Math.cos(az),Math.cos(el)*Math.sin(az),Math.sin(el)];
 const x=unit(cross(Math.abs(z[2])>.999999?[0,1,0]:[0,0,1],z)),y=cross(z,x),eye=camera.center.map((v,i)=>v+camera.distance*z[i]);
 const view=new Float32Array([x[0],y[0],z[0],0,x[1],y[1],z[1],0,x[2],y[2],z[2],0,-dot(x,eye),-dot(y,eye),-dot(z,eye),1]);
 const near=Math.max(.001,camera.distance/1000),far=camera.distance+100,f=1/Math.tan(Math.PI/6);
 return multiply(new Float32Array([f/aspect,0,0,0,0,f,0,0,0,0,(far+near)/(near-far),-1,0,0,2*far*near/(near-far),0]),view);
}
export function projectPlot(matrix,x,y,z,width,height){
 const v=[x,y,z,1],p=Array.from({length:4},(_,r)=>v.reduce((s,n,c)=>s+matrix[c*4+r]*n,0));
 if(p[3]<=0||Math.abs(p[2])>p[3])return null;return [(p[0]/p[3]+1)*width/2,(1-p[1]/p[3])*height/2];
}
export function plotGrid(style,camera){
 const out=[],add=(a,b)=>out.push(...a,...b);
 if(style.kind==='3d'){
  for(let i=0;i<=4;i++){const t=i/4;add([t,0,0],[t,1,0]);add([0,t,0],[1,t,0]);}
  add([0,0,0],[0,0,1]);add([1,0,0],[1,0,1]);add([0,1,0],[0,1,1]);add([1,1,0],[1,1,1]);add([0,0,1],[1,0,1]);add([0,0,1],[0,1,1]);add([1,0,1],[1,1,1]);add([0,1,1],[1,1,1]);
 }else{const [x0,x1,y0,y1]=camera.limits;for(let i=0;i<=4;i++){const x=x0+(x1-x0)*i/4,y=y0+(y1-y0)*i/4;add([x,y0,0],[x,y1,0]);add([x0,y,0],[x1,y,0]);}}
 return new Float32Array(out);
}
