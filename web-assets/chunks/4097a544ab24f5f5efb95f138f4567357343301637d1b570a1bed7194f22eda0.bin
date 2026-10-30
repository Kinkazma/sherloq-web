import "../../runtime-context.js?v=0.30.0";
import {retireCompositeOwners} from './composite-owner-release.js';

// A late abort can own a complete published bundle before it reaches the UI.
// Its registry keeps any rejected retirement addressable until unload/retry.
export async function retireFailedRetainedAnswer(answer,{release,protectedIds=[],primary}={}){
 const ids=new Set(),protectedSet=new Set(protectedIds),seen=new Set();
 const visit=value=>{
  if(!value||typeof value!=='object'||ArrayBuffer.isView(value)||value instanceof ArrayBuffer||seen.has(value))return;
  seen.add(value);
  const descriptor=typeof value.id==='string'&&Number.isInteger(value.revision)&&(
   Number.isInteger(value.width)&&Number.isInteger(value.height)&&typeof value.format==='string'||
   Number.isInteger(value.rowCount)&&Array.isArray(value.columns));
  if(descriptor)ids.add(value.id);
  for(const [key,part]of Object.entries(value)){
   if((key==='surfaceId'||key==='tableId')&&typeof part==='string')ids.add(part);
   else visit(part);
  }
 };
 visit(answer);
 await retireCompositeOwners([...ids].filter(id=>!protectedSet.has(id)).map(id=>()=>release(id)),{primary});
 throw primary;
}
