import "../../runtime-context.js?v=0.14.5";
import {renderPagedDenseCopy} from './dense-paged-view.js';
import {requireValue,checkAbort,controlCheckpoint} from './errors.js';
import {createDenseRegions} from './dense-regions.js';
const round=x=>{const lo=Math.floor(x),f=x-lo;return f===.5?lo+(lo%2!==0):Math.round(x);};
const f=Math.fround;
function sides(points,pairs,rows){
 const a=new Float32Array(rows.length*2),b=new Float32Array(a.length),norm=(x,y,u,v)=>{const dx=f(x-u),dy=f(y-v);return f(Math.sqrt(f(f(dx*dx)+f(dy*dy))));};
 rows.forEach((row,i)=>{const u=pairs[row*4]*7,v=pairs[row*4+1]*7;a.set(points.subarray(u,u+2),i*2);b.set(points.subarray(v,v+2),i*2);});
 const [ax,ay]=a,[bx,by]=b;
 for(let i=0;i<a.length;i+=2){const x=a[i],y=a[i+1],u=b[i],v=b[i+1];if(f(norm(x,y,ax,ay)+norm(u,v,bx,by))>f(norm(x,y,bx,by)+norm(u,v,ax,ay))){a.set([u,v],i);b.set([x,y],i);}}
 return [a,b];
}
const distinct=a=>{const keys=new Set();for(let i=0;i<a.length;i+=2)keys.add(round(a[i])+','+round(a[i+1]));return keys.size;};
export async function renderDenseCopy(image,result,input={}, {budget,signal,onProgress}={}){
 if(image.surface)return renderPagedDenseCopy(image,result,input,{budget,signal,onProgress});
 const p={low:0,high:100000,minimum:4,chosen:[],hidden:[],circles:true,lines:true,points:false,areas:true,...input};
 requireValue(Number.isFinite(p.low)&&p.low>=0&&Number.isFinite(p.high)&&p.high>=p.low&&Number.isInteger(p.minimum)&&p.minimum>=1,'Invalid dense view filter.');
 for(const key of ['chosen','hidden'])requireValue(Array.isArray(p[key])&&p[key].every(i=>Number.isSafeInteger(i)&&i>=0),'Invalid dense selected group.');
 for(const key of ['circles','lines','points','areas'])requireValue(typeof p[key]==='boolean','Invalid dense drawing switch.');
 const release=budget.reserve(48*1024**2+image.data.length*4+result.points.byteLength+result.pairs.length*64+4096);let renderer,drop;
 try{
  checkAbort(signal);const native=await createDenseRegions();checkAbort(signal);renderer=native.renderer(image,result.points,result.pairs,result.colors);
  const chosen=new Set(p.chosen),hidden=new Set(p.hidden),visible=[],legend=[],selectedGroups=[],flags=(p.circles?1:0)|(p.lines?2:0)|(p.points?4:0)|(p.areas?8:0);
  for(let index=0;index<result.groups.length;index++){
   await controlCheckpoint(signal);const group=result.groups[index],rows=group.filter(row=>result.pairs[row*4+3]>=p.low&&result.pairs[row*4+3]<=p.high);if(rows.length<p.minimum)continue;
   const [a,b]=sides(result.points,result.pairs,rows);if(Math.min(distinct(a),distinct(b))<p.minimum)continue;
   if(result.mirror_policy&&group[0]>=result.mirror_policy.base_pair_count&&renderer.overlap(Float32Array.from(a,round),Float32Array.from(b,round))>=result.mirror_policy.maximum_overlap)continue;
   legend.push([index,rows.length,group.length]);if(hidden.has(index)||chosen.size&&!chosen.has(index))continue;
   visible.push([index,rows.length]);selectedGroups.push({index,rows});renderer.group(rows,result.bases[index],flags);
  }
  checkAbort(signal);drop=budget.reserve(image.data.length+result.pairs.length*4+4096);const pixels={format:'rgb8',width:image.width,height:image.height,data:renderer.pixels()};let released=false;
  return {pixels,visible,legend,selectedGroups,style:p,release(){if(released)return;released=true;drop();}};
 }catch(error){drop?.();throw error;}finally{renderer?.dispose();release();}
}

export const denseViewHelpers=Object.freeze({round,sides,distinct});
