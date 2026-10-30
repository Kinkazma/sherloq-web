import {requireValue} from './errors.js';

// Native hull coordinates are integer pixel centres. Rational predicates keep
// boundary points inside without an empirical epsilon or random sampling.
const square=x=>x*x;
const point=p=>({x:p[0],y:p[1],d:1n,n:0n});
const diameter=(p,q)=>{const d=2n,x=p[0]+q[0],y=p[1]+q[1];return{x,y,d,n:square(x-p[0]*d)+square(y-p[1]*d)};};
const contains=(c,p)=>c!==null&&square(p[0]*c.d-c.x)+square(p[1]*c.d-c.y)<=c.n;
const cross=(p,q,r)=>(q[0]-p[0])*(r[1]-p[1])-(q[1]-p[1])*(r[0]-p[0]);
function circumcircle(p,q,r){
 const ux=q[0]-p[0],uy=q[1]-p[1],vx=r[0]-p[0],vy=r[1]-p[1],u=ux*ux+uy*uy,v=vx*vx+vy*vy;let d=2n*(ux*vy-uy*vx);if(d===0n)return null;
 let x=p[0]*d+vy*u-uy*v,y=p[1]*d+ux*v-vx*u;if(d<0n){d=-d;x=-x;y=-y;}
 return{x,y,d,n:square(x-p[0]*d)+square(y-p[1]*d)};
}
const centerCross=(p,q,c)=>(q[0]-p[0])*(c.y-p[1]*c.d)-(q[1]-p[1])*(c.x-p[0]*c.d);
const radiusLess=(a,b)=>a.n*b.d*b.d<b.n*a.d*a.d;
function twoBoundary(points,p,q){
 const base=diameter(p,q);if(points.every(r=>contains(base,r)))return base;let left=null,right=null;
 for(const r of points){
  const side=cross(p,q,r),c=circumcircle(p,q,r);if(!c)continue;
  if(side>0n&&(!left||centerCross(p,q,c)*left.d>centerCross(p,q,left)*c.d))left=c;
  else if(side<0n&&(!right||centerCross(p,q,c)*right.d<centerCross(p,q,right)*c.d))right=c;
 }
 return !left&&!right?base:!left?right:!right?left:radiusLess(left,right)?left:right;
}
function oneBoundary(points,p){
 let c=point(p);
 for(let i=0;i<points.length;i++){const q=points[i];if(!contains(c,q))c=c.n===0n?diameter(p,q):twoBoundary(points.slice(0,i+1),p,q);}
 return c;
}
/** Exact smallest enclosing disk of rounded Native centres. The finite-number
 * projection is diagnostic/admission only; coverage uses rational predicates. */
export function minimumEnclosingBiomeDisk(coordinates){
 requireValue(Array.isArray(coordinates)&&coordinates.length>0&&coordinates.every(p=>Array.isArray(p)&&p.length===2&&p.every(Number.isSafeInteger)),'Biome disk requires rounded Native pixel centres.');
 const ordered=[...new Map(coordinates.map(p=>[p.join(','),p])).values()].sort((p,q)=>p[0]-q[0]||p[1]-q[1]).map(p=>p.map(BigInt));let circle=null;
 for(let i=0;i<ordered.length;i++)if(!contains(circle,ordered[i]))circle=oneBoundary(ordered.slice(0,i+1),ordered[i]);
 requireValue(ordered.every(p=>contains(circle,p)),'Biome enclosing disk did not cover its Native support.');
 const radiusSquared=Number(circle.n)/Number(circle.d*circle.d),area=Math.PI*radiusSquared,center=[Number(circle.x)/Number(circle.d),Number(circle.y)/Number(circle.d)];requireValue([radiusSquared,area,...center].every(Number.isFinite),'Biome enclosing disk exceeds finite geometry.');
 return{center,radiusSquared,area,exact:{centerNumerators:[String(circle.x),String(circle.y)],denominator:String(circle.d),radiusSquaredNumerator:String(circle.n)}};
}
