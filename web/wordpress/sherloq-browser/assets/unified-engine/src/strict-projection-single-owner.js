import "../../runtime-context.js?v=0.30.0";
import {requireValue} from './errors.js';
import {noisesnifferOwnerRetirement} from './noisesniffer-owner-retirement.js';
const fields=['map','mask','target','source','analyzed','candidates'];
const bytes=key=>['map','target','source'].includes(key)?4:1;
// This predicate runs only AFTER signed plans and the freshly compiled domain
// have passed the strict projector's existing verification.
export function singleStrictProjectionFrame(captured,domain,width,height,origin){
 if(captured.length!==1||domain.countIncluded!==width*height||domain.rect.x0!==origin[0]||domain.rect.y0!==origin[1]||domain.rect.x1!==origin[0]+width||domain.rect.y1!==origin[1]+height)return false;
 const {job,plan}=captured[0];if(plan.fragments.length!==1)return false;const f=plan.fragments[0],box=[origin[0],origin[1],origin[0]+width,origin[1]+height];
 return f.width===width&&f.height===height&&job.bounds.every((v,i)=>v===box[i])&&f.originalBounds.every((v,i)=>v===box[i]);
}
// One donor owns every borrowed field until its complete ACK. Adopt before
// reading fields: a getter/admission failure during partial transfer still has
// a reachable retryable owner; successful field ACKs are never repeated here.
export function createStrictProjectionSingleOwner(stores,pixels){
 let donor=null,adopted=false;
 const close=noisesnifferOwnerRetirement([async()=>{if(donor)await donor.dispose();donor=null;for(const key of fields)if(Object.getOwnPropertyDescriptor(stores,key)?.configurable)delete stores[key];}]);
 return{get adopted(){return adopted;},holds:value=>donor===value,
  adopt(value){requireValue(!adopted&&!close.started&&Object.keys(stores).length===0&&value&&typeof value.dispose==='function','Unique strict projection donor required');donor=value;adopted=true;const source=value.stores;for(const key of fields){const store=source[key];requireValue(store?.byteLength===pixels*bytes(key)&&typeof store.readInto==='function'&&typeof store.dispose==='function'&&(key!=='candidates'||typeof store.write==='function'),'Strict projection donor field differs');stores[key]=store;}},
  dispose:close
 };
}
