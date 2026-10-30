import {d2prlInputSide} from './input-side.js';
import {EngineError,requireValue,checkAbort,controlCheckpoint} from '../../src/errors.js';

const schema='sherloq.d2prl-strict-fragments/1';
const signedPlans=new WeakMap();
export function requireStrictFragmentPlan(plan){const alive=signedPlans.get(plan);requireValue(alive,'The strict fragment plan must be compiled from a native source view.');alive();return plan;}
const fingerprint=async value=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(value))))].map(x=>x.toString(16).padStart(2,'0')).join('');
/** Exact rectangular partition of the admitted ORIGINAL pixels of one native
 * job. A 1-pixel fragment is retained; neural resolution remains 448 for every
 * fragment. This planner neither creates RGB holes nor runs a neural model. */
export async function createStrictFragmentPlan(view,{bounds,jobId='strict-envelope',kind='envelope',inputSide=448,budget,signal}={}){
 requireValue(view?.domain&&typeof view.admittedRectangles==='function'&&typeof view.readWindow==='function'&&budget?.reserve,'A verified native source-region view and shared budget are required.');checkAbort(signal);
 const d=view.domain,side=d2prlInputSide(inputSide);
 bounds??=[0,0,d.width,d.height];requireValue(Array.isArray(bounds)&&bounds.length===4&&bounds.every(Number.isSafeInteger)&&bounds[0]>=0&&bounds[1]>=0&&bounds[2]<=d.width&&bounds[3]<=d.height&&bounds[2]>bounds[0]&&bounds[3]>bounds[1]&&typeof jobId==='string'&&jobId.length>0&&['region','envelope','whole-image'].includes(kind),'A native half-open strict job is required.');
 const ownership=[],fragments=[];let included=0,complete=false,closed=false;
 const alive=extra=>{checkAbort(signal);checkAbort(extra);if(closed)throw new EngineError('DISPOSED','The strict fragment plan is closed.');};
 try{
  for(const r of view.admittedRectangles({x:bounds[0],y:bounds[1],width:bounds[2]-bounds[0],height:bounds[3]-bounds[1]})){
   if(fragments.length%128===0){await controlCheckpoint(signal);ownership.push(budget.reserve(128*512));}
   requireValue(view.includesRectangle(r),'A strict fragment contains an unadmitted native source pixel.');
   const index=fragments.length,b=[r.x,r.y,r.x+r.width,r.y+r.height];fragments.push(Object.freeze({id:jobId+'/fragment-'+index,index,bounds:Object.freeze(b),width:r.width,height:r.height,originalBounds:Object.freeze(b.map((v,i)=>v+d.origin[i%2])),modelSide:side}));included+=r.width*r.height;
  }
  if(!fragments.length)throw new EngineError('SOURCE_SCOPE_EMPTY','This strict job contains no admitted native source pixels.');
  const key=await fingerprint([schema,side,d.fingerprint,jobId,kind,bounds,fragments.map(f=>f.bounds)]);alive();
  const api={schema,fingerprint:key,domainFingerprint:d.fingerprint,sourceSha256:d.sourceSha256,sourceWidth:d.sourceWidth,sourceHeight:d.sourceHeight,origin:Object.freeze([...d.origin]),jobId,kind,bounds:Object.freeze([...bounds]),fragments:Object.freeze(fragments),includedPixels:included,modelSide:side,
   input(id){alive();const f=typeof id==='number'?fragments[id]:fragments.find(f=>f.id===id);requireValue(f,'Unknown strict fragment input.');return{width:f.width,height:f.height,originalBounds:f.originalBounds,async readRows(y,count,{signal:extra}={}){alive(extra);requireValue(Number.isSafeInteger(y)&&Number.isSafeInteger(count)&&y>=0&&count>0&&y+count<=f.height,'Strict fragment rows must remain inside their admitted rectangle.');const lease=await view.readWindow({x:f.bounds[0],y:f.bounds[1]+y,width:f.width,height:count},{signal:extra});try{alive(extra);return lease;}catch(error){lease.release();throw error;}}};},
   locateOriginal(x,y){alive();if(!Number.isFinite(x)||!Number.isFinite(y))return null;const ix=Math.floor(x+.5)-d.origin[0],iy=Math.floor(y+.5)-d.origin[1];return fragments.find(f=>ix>=f.bounds[0]&&iy>=f.bounds[1]&&ix<f.bounds[2]&&iy<f.bounds[3])??null;},
   toOriginal(fragment,x,y,{gridSide=side}={}){alive();const f=typeof fragment==='number'?fragments[fragment]:fragment;requireValue(fragments[f?.index]===f&&Number.isFinite(x)&&Number.isFinite(y)&&Number.isSafeInteger(gridSide)&&gridSide>1,'A strict fragment coordinate is required.');return[f.originalBounds[0]+(x+.5)*f.width/gridSide-.5,f.originalBounds[1]+(y+.5)*f.height/gridSide-.5];},
   fromOriginal(fragment,x,y,{gridSide=side}={}){alive();const f=typeof fragment==='number'?fragments[fragment]:fragment;requireValue(fragments[f?.index]===f&&Number.isFinite(x)&&Number.isFinite(y)&&Number.isSafeInteger(gridSide)&&gridSide>1,'An original coordinate and its strict fragment are required.');return[(x-f.originalBounds[0]+.5)*gridSide/f.width-.5,(y-f.originalBounds[1]+.5)*gridSide/f.height-.5];},
   release(){if(closed)return;closed=true;for(const free of ownership.splice(0))free();}
  };signedPlans.set(api,()=>alive());complete=true;return Object.freeze(api);
 }finally{if(!complete)for(const free of ownership)free();}
}
