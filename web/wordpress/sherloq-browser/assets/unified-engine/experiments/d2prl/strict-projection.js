// PRIVATE zone-correctness fix. The scorer and candidate generator are unchanged.
// The packed membership was checked at the bounded target, not at a possibly
// out-of-envelope raw offset. Return that same representable bounded target.
const f=Math.fround;
export function projectStrictSurvivingTarget(packed,{at,count,sourceX,sourceY,scoredX,scoredY,side,allowedTarget}){
 let best=-1,distance=Infinity,bestX,bestY,bestTargetX,bestTargetY;
 for(let k=0;k<packed.candidates;k++){
  const p=k*count+at;if(!packed.valid[p])continue;
  const rawX=packed.offsetX[p],rawY=packed.offsetY[p],gx=f(sourceX+rawX),gy=f(sourceY+rawY);
  const boundedX=Math.max(0,Math.min(side-1,gx)),boundedY=Math.max(0,Math.min(side-1,gy));
  const x=boundedX===gx?rawX:f(boundedX-sourceX),y=boundedY===gy?rawY:f(boundedY-sourceY);
  const targetX=f(sourceX+x),targetY=f(sourceY+y);
  // Check the SAME addition the final coordinates use. If a bounded position
  // cannot be represented through this source offset, it cannot be returned.
  if(targetX!==boundedX||targetY!==boundedY||!allowedTarget(targetX,targetY))continue;
  const d=(targetX-scoredX)**2+(targetY-scoredY)**2;
  if(d<distance){distance=d;best=p;bestX=x;bestY=y;bestTargetX=targetX;bestTargetY=targetY;}
 }
 return best<0?null:{index:best,x:bestX,y:bestY,targetX:bestTargetX,targetY:bestTargetY,distance};
}
