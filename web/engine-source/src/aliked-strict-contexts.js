import {planAdmittedNativeContexts} from './admitted-native-context-cover.js';
import {alikedShape} from './aliked-worker.js';
import {roundEven} from './pixel-utils.js';
import {requireValue,checkAbort,createCooperator} from './errors.js';

const right=r=>r.x+r.width,bottom=r=>r.y+r.height;
const intersect=(a,b)=>{const x=Math.max(a.x,b.x),y=Math.max(a.y,b.y),r=Math.min(right(a),right(b)),d=Math.min(bottom(a),bottom(b));return r>x&&d>y?{x,y,width:r-x,height:d-y}:null;};
/** Geometry only, no RGB/NN. The shared admitted-window cover is used with
 * minimum1/alignment1, never XFeat's32 grid. Whole rectangles retain exactly
 * their native aspect1024 shape, including native empty-DKD/rejection cases.
 * Fragmented thin contexts may explicitly request literal ratio subdivision;
 * this is a new boundary/scale policy, not equivalence with an uncut image. */
export async function planAlikedStrictContexts(view,{width=view?.descriptor?.width,height=view?.descriptor?.height,budget,signal,thinContextPolicy='preserve-native'}={}){
 requireValue(['preserve-native','split-for-native-dkd'].includes(thinContextPolicy),'An explicit ALIKED thin-context policy is required.');
 const origin=[...(view?.domain?.origin??[0,0])];requireValue(origin.length===2&&origin.every(Number.isSafeInteger),'ALIKED source origin must remain an exact Original pixel coordinate.');
 const base=await planAdmittedNativeContexts(view,{width,height,minimumWidth:1,minimumHeight:1,alignmentX:1,alignmentY:1,maximumWidth:16384,maximumHeight:16384,budget,signal}),credits=[],contexts=[],adaptations=[],cooperate=createCooperator(signal);let complete=false;
 try{
  for(const parent of base.contexts){
   await cooperate();let pieces=[parent];const [pw,ph]=alikedShape(parent.width,parent.height);
   if(!base.preservedRectangle&&thinContextPolicy==='split-for-native-dkd'&&Math.min(pw,ph)<5){
    const horizontal=parent.width>parent.height,short=horizontal?parent.height:parent.width,extent=horizontal?parent.width:parent.height,step=short*204;pieces=[];
    for(let at=0;at<extent;at+=step)pieces.push({x:parent.x+(horizontal?at:0),y:parent.y+(horizontal?0:at),width:horizontal?Math.min(step,extent-at):parent.width,height:horizontal?parent.height:Math.min(step,extent-at)});
    adaptations.push({parent:parent.index,originalRectangle:{x:parent.x,y:parent.y,width:parent.width,height:parent.height},nativeShape:[pw,ph],literalPieces:pieces.map(r=>({...r})),reason:'explicit fragmented-context subdivision to retain at least5prepared cells on the short axis; real RGB only; native per-piece resize/padding; no uncut equivalence'});
   }
   for(const rect of pieces){
    await cooperate();requireValue(view.includesRectangle(rect),'ALIKED native context crosses forbidden RGB.');const owned=parent.ownedRectangles.map(r=>intersect(r,rect)).filter(Boolean),ownedPixels=owned.reduce((n,r)=>n+r.width*r.height,0);if(!ownedPixels)continue;credits.push(budget.reserve(1024+owned.length*128));const [preparedWidth,preparedHeight]=alikedShape(rect.width,rect.height),index=contexts.length;
    contexts.push(Object.freeze({index,parent:parent.index,rect:Object.freeze({x:rect.x,y:rect.y,width:rect.width,height:rect.height}),ownedRectangles:Object.freeze(owned.map(Object.freeze)),ownedPixels,preparedWidth,preparedHeight,scaleX:Math.fround(preparedWidth/rect.width),scaleY:Math.fround(preparedHeight/rect.height),nativeInputEvaluable:preparedWidth>0&&preparedHeight>0,nativeDetectorHasInterior:preparedWidth>=5&&preparedHeight>=5}));
   }
  }
  checkAbort(signal);const ownedPixels=contexts.reduce((n,c)=>n+c.ownedPixels,0);requireValue(ownedPixels===base.sourceAdmittedPixels&&base.noNativeSupportPixels===0,'ALIKED context ownership lost admitted RGB pixels.');let disposed=false;
  const alive=()=>requireValue(!disposed,'ALIKED context coverage was retired.'),owns=(index,x,y)=>{alive();x-=origin[0];y-=origin[1];return contexts[index]?.ownedRectangles.some(r=>x>=r.x&&x<right(r)&&y>=r.y&&y<bottom(r))??false;};
  complete=true;return{origin:Object.freeze(origin),contexts:Object.freeze(contexts),preservedRectangle:base.preservedRectangle,sourceAdmittedPixels:base.sourceAdmittedPixels,uniqueOwnedSourcePixels:ownedPixels,sourceCoverageComplete:true,thinContextPolicy,adaptations:Object.freeze(adaptations),
   preparedPoint(index,x,y){alive();const c=contexts[index];requireValue(c&&Number.isFinite(x)&&Number.isFinite(y)&&c.nativeInputEvaluable,'Invalid ALIKED native prepared coordinate.');const xx=Math.max(0,Math.min(c.rect.width-1,roundEven((x+.5)/c.scaleX-.5)))+c.rect.x,yy=Math.max(0,Math.min(c.rect.height-1,roundEven((y+.5)/c.scaleY-.5)))+c.rect.y;return[xx+origin[0],yy+origin[1]];},
   ownsOriginal:owns,
   ownsPrepared(index,x,y){const [xx,yy]=this.preparedPoint(index,x,y);return owns(index,xx,yy);},
   metadata:{resize:'unchanged alikedShape1024 per literal native context; RGB/255 and native Gaussian/bilinear remain upstream',ownership:'one owner per admitted Original pixel; all prepared samples whose native nearest source pixel belongs to that owner form the shared score population',preparedPopulation:'different context scales remain distinct native observations; within-context upsampling multiplicity is retained',equivalence:'no uncut-image equivalence for fragmented contexts; source coverage and native context arithmetic are separate claims'},
   dispose(){if(disposed)return;disposed=true;for(const free of credits.splice(0))free();base.dispose();}};
 }finally{if(!complete){for(const free of credits)free();base.dispose();}}
}
