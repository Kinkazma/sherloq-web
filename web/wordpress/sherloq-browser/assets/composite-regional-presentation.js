import {createRemoteSurface} from './remote-surface.js';
import {EngineError,requireValue} from './unified-engine/src/errors.js';
/** Presentation only: sample the existing immutable Original handle through its
 * existing RGB reader. No scientific crop/handle or new RPC is manufactured. */
export function createCompositeRegionalPresentation({display,domain,sourceSha256,cache,request,isCurrent,changed,onError}){
 requireValue(domain.snapshot.sourceSha256===sourceSha256&&display?.format==='rgb8'&&display.width===domain.snapshot.width&&display.height===domain.snapshot.height&&domain.countIncluded===domain.width*domain.height&&typeof isCurrent==='function','Composite Original presentation grid differs.');
 const [ox,oy]=domain.origin;let closed=false;
 const current=()=>{if(closed||!isCurrent())throw new EngineError('CANCELLED','Composite Original presentation was replaced.');};
 const translated=async(action,payload)=>{
  current();let answer;
  if(action==='read-window'){const r=payload.rect;requireValue([r.x,r.y,r.width,r.height].every(Number.isSafeInteger)&&r.x>=0&&r.y>=0&&r.width>0&&r.height>0&&r.x+r.width<=domain.width&&r.y+r.height<=domain.height,'Composite source presentation window exceeds its crop.');answer=await request(action,{display,rect:{...r,x:r.x+ox,y:r.y+oy}});}
  else{const t=payload.tile;requireValue([t.x,t.y,t.w,t.h,t.step].every(Number.isSafeInteger)&&t.x>=0&&t.y>=0&&t.w>0&&t.h>0&&t.step>0&&t.x+t.w<=domain.width&&t.y+t.h<=domain.height,'Composite source presentation tile exceeds its crop.');answer=await request(action,{display,tile:{...t,x:t.x+ox,y:t.y+oy}});}
  current();return answer;
 };
 const surface=createRemoteSurface({...display,id:'composite-presentation/'+display.id+'/'+domain.fingerprint,width:domain.width,height:domain.height,sourceRegionOrigin:[ox,oy]},cache,translated,changed,onError),close=surface.close;
 surface.close=()=>{closed=true;close();};return surface;
}
