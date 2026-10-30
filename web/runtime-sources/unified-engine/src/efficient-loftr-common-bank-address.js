import "../../runtime-context.js?v=0.30.0";
import {requireValue,checkAbort,controlCheckpoint} from './errors.js';

function bank(plan,side){
 requireValue(plan?.schema==='sherloq.efficient-loftr-literal-context-plan/3'&&plan.status==='ready'&&(side===0||side===1),'Two ready native literal-context ROI banks are required.');
 const b=plan.banks[side];let next=0;
 for(const c of b.contexts){const{width,height}=c.coarse;requireValue(Number.isSafeInteger(width)&&Number.isSafeInteger(height)&&width>=4&&height>=4&&width%4===0&&height%4===0&&c.coarseOffset===next,'Native padded coarse-grid dictionary changed.');next+=width*height;}
 requireValue(next===b.coarseCells&&Number.isSafeInteger(next)&&next>0,'Native coarse population does not match its dictionary.');return b;
}
function borderFlags(b){const flags=new Uint8Array(b.coarseCells);for(const c of b.contexts){const w=c.coarse.width,h=c.coarse.height;for(let y=2;y<h-2;y++)flags.fill(1,c.coarseOffset+y*w+2,c.coarseOffset+y*w+w-2);}return flags;}

/** Spatial bool addressing only, AFTER the native FP32 Greater. Neither
 * confidence nor any attention/softmax population is modified by this mask.
 */
export async function applyEfficientLoFtrNativeLocalBorder(greater,plan,{budget,signal}={}){
 const a=bank(plan,0),b=bank(plan,1),size=a.coarseCells*b.coarseCells;
 requireValue(greater instanceof Uint8Array&&Number.isSafeInteger(size)&&greater.length===size&&typeof budget?.reserve==='function','Native Greater bool matrix and memory admission are required.');checkAbort(signal);
 const release=budget.reserve(size+a.coarseCells+b.coarseCells);let returned=false;
 try{
  const left=borderFlags(a),right=borderFlags(b),data=new Uint8Array(size);
  for(let i=0;i<a.coarseCells;i++){
   const offset=i*b.coarseCells;
   for(let j=0;j<b.coarseCells;j++){const v=greater[offset+j];requireValue(v===0||v===1,'Native Greater output must contain bool0/1.');if(left[i]&&right[j])data[offset+j]=v;}
   if(i%16===0)await controlCheckpoint(signal);
  }
  checkAbort(signal);let released=false;returned=true;
  return{data,dims:[1,a.coarseCells,b.coarseCells],type:'bool',policy:'native-Greater-then-native-local-border2-only',qualified:false,release(){if(!released){released=true;release();}}};
 }finally{if(!returned)release();}
}

export function addressEfficientLoFtrCoarseIndex(plan,side,index){
 const b=bank(plan,side);requireValue(Number.isSafeInteger(index)&&index>=0&&index<b.coarseCells,'Native coarse index lies outside its ROI bank.');
 let lo=0,hi=b.contexts.length;
 while(lo+1<hi){const mid=(lo+hi)>>>1;if(b.contexts[mid].coarseOffset<=index)lo=mid;else hi=mid;}
 const context=b.contexts[lo],localIndex=index-context.coarseOffset,width=context.coarse.width;
 return{side,context,localIndex,x:(localIndex%width)*8,y:Math.floor(localIndex/width)*8};
}
