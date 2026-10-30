import "../../runtime-context.js?v=0.30.0";
import {requireValue} from './errors.js';

// Historical OpenCV cvRound tie rule, shared by drawing/selection/preview.
export function roundEven(x){const low=Math.floor(x),fraction=x-low;return fraction<.5?low:fraction>.5?low+1:low%2===0?low:low+1;}
export function traceCircleScale(value=100){requireValue(Number.isInteger(value)&&value>=1&&value<=300,'Invalid trace circle scale percentage.');return value;}
export function nativeTraceCircle(points,index,circleScale=100){
 traceCircleScale(circleScale);const at=index*7,x=roundEven(points[at]),y=roundEven(points[at+1]),legacyRadius=Math.max(2,roundEven(points[at+2]/2)),radius=circleScale===100?legacyRadius:Math.max(2,roundEven(legacyRadius*circleScale/100));
 requireValue([x,y,radius].every(Number.isSafeInteger),'Invalid native trace circle.');return{x,y,radius};
}
const distanceSquared=(a,b)=>(a[0]-b[0])**2+(a[1]-b[1])**2;
function segmentDistanceSquared(center,a,b){const x=b[0]-a[0],y=b[1]-a[1],n=x*x+y*y,t=n?Math.max(0,Math.min(1,((center[0]-a[0])*x+(center[1]-a[1])*y)/n)):0;return distanceSquared(center,[a[0]+t*x,a[1]+t*y]);}
/** Border-to-border centreline, then one Native pixel-grid projection shared
 * by Wasm and fallback. No line is returned inside overlapping/touching disks. */
export function clipTraceLineToCircles(first,second){
 requireValue([first?.x,first?.y,first?.radius,second?.x,second?.y,second?.radius].every(Number.isSafeInteger)&&first.radius>=0&&second.radius>=0,'Invalid trace clipping circles.');
 const dx=second.x-first.x,dy=second.y-first.y,d=Math.hypot(dx,dy);if(!d||d<=first.radius+second.radius)return null;
 const ux=dx/d,uy=dy/d,idealA=[first.x+ux*first.radius,first.y+uy*first.radius],idealB=[second.x-ux*second.radius,second.y-uy*second.radius],a=idealA.map(roundEven),b=idealB.map(roundEven),major=Math.abs(dx)>=Math.abs(dy)?0:1,sign=Math.sign(major===0?dx:dy);
 // cvRound can put a border sample inside its disk. Advance by integral Native
 // grid steps toward the exterior; no empirical pixel/radius margin is added.
 while(distanceSquared(a,[first.x,first.y])<first.radius**2)a[major]+=sign;
 while(distanceSquared(b,[second.x,second.y])<second.radius**2)b[major]-=sign;
 if((b[0]-a[0])*ux+(b[1]-a[1])*uy<=0||segmentDistanceSquared([first.x,first.y],a,b)<first.radius**2||segmentDistanceSquared([second.x,second.y],a,b)<second.radius**2)return null;
 return{a,b,idealA,idealB};
}
