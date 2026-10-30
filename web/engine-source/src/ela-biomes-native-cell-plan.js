import {planGhostNativeContexts} from './ghost-native-context-plan.js';
import {requireValue,createCooperator,checkAbort} from './errors.js';

const contains=(outer,inner)=>inner.x>=outer.x&&inner.y>=outer.y&&inner.x+inner.width<=outer.x+outer.width&&inner.y+inner.height<=outer.y+outer.height;
export const ELA_BIOMES_CELL_PLAN_VERSION='admitted-common-native-biome-cells/1';

// Geometry only. Context RGB is always completely admitted. Cells keep one
// common grid and one global statistical population; atlas adjacency is never
// substituted for their original spatial neighbourhood.
export async function planElaBiomesNativeCells(view,block,{budget,signal}={}){
 const {width,height}=view.domain,cols=Math.floor(width/block),rows=Math.floor(height/block),n=rows*cols;
 requireValue(Number.isInteger(block)&&block>=16&&block<=65500&&block%8===0&&n>=25&&n<=16384,'Complete bounded Native Biomes grid required.');
 const fee=budget.reserve(4096+n*128),cooperate=createCooperator(signal);let nativePlan,complete=false;
 try{
  nativePlan=await planGhostNativeContexts(view,{budget,signal});
  const candidates=nativePlan.contexts.map(({rect})=>({...rect,cells:[]})),admitted=new Uint8Array(n);let geometricallyAdmitted=0,analysed=0;
  for(let y=0;y<rows;y++)for(let x=0;x<cols;x++){
   await cooperate();const rect={x:x*block,y:y*block,width:block,height:block};
   if(!view.includesRectangle(rect))continue;geometricallyAdmitted++;
   let context=candidates.find(c=>contains(c,rect));
   // A canonical geometric cover can leave a complete larger cell crossing
   // candidate boundaries. Preserve that actually admitted cell explicitly.
   if(!context){context={...rect,cells:[]};candidates.push(context);}
   if(context.width>65500||context.height>65500)continue;
   const gridX=Math.ceil(context.x/block)*block-context.x,gridY=Math.ceil(context.y/block)*block-context.y,localCols=Math.floor((context.width-gridX)/block),localX=(rect.x-context.x-gridX)/block,localY=(rect.y-context.y-gridY)/block;
   requireValue(Number.isInteger(localX)&&Number.isInteger(localY)&&localX>=0&&localY>=0&&localX<localCols,'Native context cell lost its common grid.');
   const index=y*cols+x;context.cells.push({index,local:localY*localCols+localX});admitted[index]=1;analysed++;
  }
  const contexts=candidates.filter(c=>c.cells.length).map((c,id)=>{
   const gridX=Math.ceil(c.x/block)*block-c.x,gridY=Math.ceil(c.y/block)*block-c.y;
   return {...c,id,gridOffset:[gridX,gridY],cols:Math.floor((c.width-gridX)/block),rows:Math.floor((c.height-gridY)/block)};
  });
  requireValue(admitted.reduce((a,b)=>a+b,0)===analysed,'Native Biomes cell ownership is duplicated.');checkAbort(signal);let closed=false;complete=true;
  return {version:ELA_BIOMES_CELL_PLAN_VERSION,block,cols,rows,contexts,admitted,geometricallyAdmittedCells:geometricallyAdmitted,analysedCells:analysed,selectedPixels:nativePlan.selectedPixels,analysedPixels:analysed*block*block,unanalysablePixels:nativePlan.selectedPixels-analysed*block*block,
   release(){if(closed)return;closed=true;nativePlan.release();fee();}};
 }finally{if(!complete){nativePlan?.release();fee();}}
}
