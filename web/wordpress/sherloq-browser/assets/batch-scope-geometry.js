// Geometry only: source pixels and PDF streams are never painted or replaced.
export const rectanglePolygon=({x0,y0,x1,y1})=>[[x0,y0],[x1,y0],[x1,y1],[x0,y1]];
export function inversePlacement(matrix){
 if(!Array.isArray(matrix)||matrix.length!==6||!matrix.every(Number.isFinite))throw Error('Invalid PDF image placement');
 const [a,b,c,d,e,f]=matrix,det=a*d-b*c;if(Math.abs(det)<1e-12)throw Error('Singular PDF image placement');
 return [d/det,-b/det,-c/det,a/det,(c*f-d*e)/det,(b*e-a*f)/det];
}
const transform=(m,[x,y])=>[m[0]*x+m[2]*y+m[4],m[1]*x+m[3]*y+m[5]];
export function clipPolygon(polygon,width,height){
 if(!Array.isArray(polygon)||polygon.length<3||!polygon.every(p=>Array.isArray(p)&&p.length===2&&p.every(Number.isFinite)))throw Error('Invalid scope polygon');
 let out=polygon.map(p=>p.slice());
 for(const [axis,bound,less]of [[0,0,false],[0,width,true],[1,0,false],[1,height,true]]){
  const inside=p=>less?p[axis]<=bound:p[axis]>=bound,next=[];
  for(let i=0;i<out.length;i++){const a=out[i],b=out[(i+1)%out.length],ai=inside(a),bi=inside(b);if(ai)next.push(a);if(ai!==bi){const t=(bound-a[axis])/(b[axis]-a[axis]);next.push([a[0]+t*(b[0]-a[0]),a[1]+t*(b[1]-a[1])]);}}
  out=next;if(!out.length)break;
 }
 const area=Math.abs(out.reduce((n,p,i)=>{const q=out[(i+1)%out.length];return n+p[0]*q[1]-q[0]*p[1];},0))/2;
 return out.length>=3&&area>1e-8?out:[];
}
export function pdfTextPolygons(content){
 const polygons=[];
 for(const item of content?.items??[]){
  if(!item.str?.trim()||!item.transform||!(item.width>0))continue;
  const [a,b,c,d,x,y]=item.transform,advance=Math.hypot(a,b),fontHeight=Math.hypot(c,d);if(!advance||!fontHeight)continue;
  const style=content.styles?.[item.fontName]??{},ascent=Number.isFinite(style.ascent)?style.ascent:.8,descent=Number.isFinite(style.descent)?style.descent:ascent-1;
  const dx=a/advance*item.width,dy=b/advance*item.width,up=[c/fontHeight,d/fontHeight],low=descent*fontHeight,high=ascent*fontHeight;
  polygons.push([[x+up[0]*low,y+up[1]*low],[x+dx+up[0]*low,y+dy+up[1]*low],[x+dx+up[0]*high,y+dy+up[1]*high],[x+up[0]*high,y+up[1]*high]]);
 }
 return polygons;
}
export function projectPdfExclusions(polygons,matrix,width,height){
 const inverse=inversePlacement(matrix);
 return polygons.map(poly=>clipPolygon(poly.map(p=>{const [u,v]=transform(inverse,p);return [u*width,(1-v)*height];}),width,height)).filter(p=>p.length);
}
export const offsetPolygons=(polygons,x,y)=>polygons.map(p=>p.map(([a,b])=>[a+x,b+y]));
// The complement of acquisition rectangles is represented as disjoint strips,
// rather than allocating a width*height bitmap or enclosing mixed panels.
export function rectangleComplement(regions,width,height){
 const rectangles=regions.map(r=>({x0:Math.max(0,r.x0),y0:Math.max(0,r.y0),x1:Math.min(width,r.x1),y1:Math.min(height,r.y1)})).filter(r=>r.x1>r.x0&&r.y1>r.y0);
 const ys=[...new Set([0,height,...rectangles.flatMap(r=>[r.y0,r.y1])])].sort((a,b)=>a-b),out=[];
 for(let i=0;i<ys.length-1;i++){
  const y0=ys[i],y1=ys[i+1],intervals=rectangles.filter(r=>r.y0<=y0&&r.y1>=y1).map(r=>[r.x0,r.x1]).sort((a,b)=>a[0]-b[0]);let edge=0;
  for(const [x0,x1]of intervals){if(x0>edge)out.push(rectanglePolygon({x0:edge,y0,x1:x0,y1}));edge=Math.max(edge,x1);}
  if(edge<width)out.push(rectanglePolygon({x0:edge,y0,x1:width,y1}));
 }
 return out;
}
