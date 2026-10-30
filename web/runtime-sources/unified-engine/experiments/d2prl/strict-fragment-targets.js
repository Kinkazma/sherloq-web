import {allocateOwnedTypedArray} from '../../src/allocation.js';
import {requireValue,checkAbort,controlCheckpoint} from '../../src/errors.js';
import {requireStrictFragmentPlan} from './strict-fragment-plan.js';
const f=Math.fround;
/** Global offsets use the declared envelope's native normalized frame. Each
 * target retains its actual fragment identity and full native descriptor grid;
 * a gap or real exclusion is rejected before reading its descriptor. */
export async function packStrictFragmentCandidates(plan,bank,evaluator,{fragment,offsetX,offsetY,candidates,begin,end,field,channels,side=448,candidateAdmits=()=>true,residentSlots=new Map()},{budget,signal}={}){
 requireStrictFragmentPlan(plan);const owner=typeof fragment==='number'?plan.fragments[fragment]:fragment,count=end-begin,n=side*side;
 requireValue(owner&&plan.fragments[owner.index]===owner&&Number.isSafeInteger(side)&&side>=2&&side<=1792&&Number.isSafeInteger(begin)&&Number.isSafeInteger(end)&&begin>=0&&end<=n&&count>0&&count<=(evaluator.stats?.backend==='webgpu'&&residentSlots.size===plan.fragments.length-1?65536:4096)&&Number.isSafeInteger(candidates)&&candidates>=1&&candidates<=13&&offsetX instanceof Float32Array&&offsetY instanceof Float32Array&&offsetX.length===candidates*n&&offsetY.length===candidates*n&&[36,96].includes(channels)&&typeof field==='string'&&typeof candidateAdmits==='function'&&residentSlots instanceof Map&&[...residentSlots].every(([index,slot])=>Number.isSafeInteger(index)&&index!==owner.index&&plan.fragments[index]&&Number.isSafeInteger(slot)&&slot>=0&&slot<(evaluator.residentForeignCapacity??0)),'Complete strict native candidates are required.');checkAbort(signal);
 const owned=[],allocate=(Type,length,label)=>{const lease=allocateOwnedTypedArray(Type,length,{budget,owner:'d2prl',label});owned.push(lease);return lease.data;};let supports,complete=false;
 try{
  const targetX=allocate(Float32Array,candidates*count,'strict-target-x'),targetY=allocate(Float32Array,candidates*count,'strict-target-y'),ox=allocate(Float32Array,candidates*count,'strict-global-offset-x'),oy=allocate(Float32Array,candidates*count,'strict-global-offset-y'),valid=allocate(Uint8Array,candidates*count,'strict-target-membership'),owners=allocate(Int32Array,candidates*count,'strict-target-fragment'),originalX=allocate(Float32Array,count,'strict-source-global-x'),originalY=allocate(Float32Array,count,'strict-source-global-y'),cornerOffsets=allocate(Int32Array,candidates*count,'strict-foreign-descriptor-offsets');owners.fill(-1);cornerOffsets.fill(-1);
  const [localX0,localY0,localX1,localY1]=plan.bounds,x0=localX0+plan.origin[0],y0=localY0+plan.origin[1],width=localX1-localX0,height=localY1-localY0,whole=owner.bounds.every((v,i)=>v===plan.bounds[i]);let admitted=0,foreign=0,packedForeign=0,residentForeign=0,stamp=performance.now();
  for(let i=0;i<count;i++){
   if((i&127)===0){checkAbort(signal);if(performance.now()-stamp>=8){await controlCheckpoint(signal);stamp=performance.now();}}const at=begin+i,lx=at%side,ly=Math.floor(at/side),position=plan.toOriginal(owner,lx,ly,{gridSide:side}),sx=whole?lx:f((position[0]+.5-x0)*side/width-.5),sy=whole?ly:f((position[1]+.5-y0)*side/height-.5);originalX[i]=sx;originalY[i]=sy;
   const sourceAllowed=candidateAdmits(position[0],position[1]);for(let k=0;k<candidates;k++){
    const p=k*count+i,j=k*n+at;requireValue(Number.isFinite(offsetX[j])&&Number.isFinite(offsetY[j]),'Nonfinite strict candidate offset.');ox[p]=offsetX[j];oy[p]=offsetY[j];if(!sourceAllowed)continue;
    const gx=Math.max(0,Math.min(side-1,f(sx+ox[p]))),gy=Math.max(0,Math.min(side-1,f(sy+oy[p])));const original=[x0+(gx+.5)*width/side-.5,y0+(gy+.5)*height/side-.5],target=plan.locateOriginal(...original);if(!target||!candidateAdmits(...original))continue;
    const local=whole&&target.index===owner.index?[gx,gy]:plan.fromOriginal(target,...original,{gridSide:side});targetX[p]=Math.max(0,Math.min(side-1,local[0]));targetY[p]=Math.max(0,Math.min(side-1,local[1]));owners[p]=target.index;valid[p]=1;admitted++;if(target.index!==owner.index){const slot=residentSlots.get(target.index);if(slot===undefined)cornerOffsets[p]=packedForeign++*channels*4;else{cornerOffsets[p]=-2-slot;residentForeign++;}foreign++;}
   }
  }
  const corners=allocate(Uint16Array,packedForeign*channels*4,'strict-native-foreign-target-corners');if(packedForeign)supports=await evaluator.supports({x:targetX,y:targetY,side},{signal});let readBytes=0,readCalls=0;
  for(const target of plan.fragments){checkAbort(signal);if(target.index===owner.index)continue;let length=0;for(let p=0;p<owners.length;p++)if(owners[p]===target.index&&cornerOffsets[p]>=0)length+=4;if(!length)continue;const positions=allocate(Int32Array,length,'strict-gather-positions'),destinations=allocate(Int32Array,length,'strict-gather-destinations');let at=0;for(let p=0;p<owners.length;p++)if(owners[p]===target.index&&cornerOffsets[p]>=0)for(let k=0;k<4;k++){positions[at]=supports.data[p*4+k];destinations[at++]=cornerOffsets[p]+k;}const result=await bank.gatherHalfCorners(target.index,field,{positions,destinations,output:corners},{signal});readBytes+=result.readBytes;readCalls+=result.readCalls;
   // Release temporary gather metadata immediately rather than retaining all
   // fragment groups until a native tile has finished.
   owned.pop().release();owned.pop().release();
  }
  supports?.release();supports=null;checkAbort(signal);complete=true;let released=false;return{channels,side,candidates,begin,end,corners,cornerOffsets,targetX,targetY,offsetX:ox,offsetY:oy,valid,originalX,originalY,bounds:[0,0,side-1,side-1],owners,admitted,foreignTargets:foreign,residentForeignTargets:residentForeign,packedForeignTargets:packedForeign,localTargets:admitted-foreign,readBytes,readCalls,release(){if(released)return;released=true;for(const lease of owned)lease.release();}};
 }finally{supports?.release();if(!complete)for(const lease of owned)lease.release();}
}
