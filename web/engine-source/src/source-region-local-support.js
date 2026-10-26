// A support plan is a set of output centres, never a fabricated input raster.
// Intersections are computed on admitted native row spans, before a kernel can
// read its halo. The new native envelope edges retain the kernel's border rule.
function intersect(a,b){const out=[];let i=0,j=0;while(i<a.length&&j<b.length){const left=Math.max(a[i][0],b[j][0]),right=Math.min(a[i][1],b[j][1]);if(left<right)out.push([left,right]);if(a[i][1]<b[j][1])i++;else j++;}return out;}
export function* sourceRegionLocalCores(domain,{radius=0,maxWidth=256,maxHeight=128}={}){
 const sw=domain.width,sh=domain.height;
 function row(y){let spans=domain.rowIntervals(y).map(([a,b])=>[a,b]);
  if(radius)for(let dy=-radius;dy<=radius&&spans.length;dy++){
   // Replication and reflection need the same clipped native support set:
   // reflected samples are already covered by the positive/negative halo.
   const sy=Math.max(0,Math.min(sh-1,y+dy));
   const admitted=domain.rowIntervals(sy).map(([a,b])=>[a===0?a:a+radius,b===sw?b:b-radius]).filter(([a,b])=>a<b);
   spans=intersect(spans,admitted);
  }
  return spans;
 }
 let active=new Map();
 for(let y=0;y<domain.height;y++){
  const next=new Map();for(const[a,b]of row(y))for(let x=a;x<b;x+=maxWidth){const width=Math.min(maxWidth,b-x),key=x+':'+width,prior=active.get(key);if(prior&&prior.height<maxHeight)next.set(key,{...prior,height:prior.height+1});else{if(prior)yield prior;next.set(key,{x,y,width,height:1});}}
  for(const[key,rect]of active)if(!next.has(key))yield rect;active=next;
 }
 yield*active.values();
}
export function sourceRegionLocalSupport(domain,core,radius){const x=Math.max(0,core.x-radius),y=Math.max(0,core.y-radius),right=Math.min(domain.width,core.x+core.width+radius),bottom=Math.min(domain.height,core.y+core.height+radius);return{x,y,width:right-x,height:bottom-y};}
