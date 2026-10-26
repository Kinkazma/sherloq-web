import "../../runtime-context.js?v=0.25.0";
// Per-owner state only. A refusal keeps the same owner available for retry.
export function createOcrRetirementOwner(retire,{onReleased}={}){
 let released=false,pending;
 const finish=value=>{released=true;pending=undefined;onReleased?.();return value;};
 return{
  get released(){return released;},
  release(){
   if(released)return;
   if(pending)return pending;
   const value=retire();
   if(value&&typeof value.then==='function'){
    pending=Promise.resolve(value).then(finish,error=>{pending=undefined;throw error;});
    return pending;
   }
   return finish(value);
  }
 };
}

// Keep synchronous lease releases synchronous, while observing every async ACK.
export function retireOcrLeases(owners){
 let failed=false,failure;
 const remember=error=>{if(!failed){failed=true;failure=error;}};
 function next(index){
  for(;index<owners.length;index++){
   let value;try{value=owners[index]?.();}catch(error){remember(error);continue;}
   if(value&&typeof value.then==='function')return Promise.resolve(value).then(()=>next(index+1),error=>{remember(error);return next(index+1);});
  }
  if(failed)throw failure;
 }
 return next(0);
}
