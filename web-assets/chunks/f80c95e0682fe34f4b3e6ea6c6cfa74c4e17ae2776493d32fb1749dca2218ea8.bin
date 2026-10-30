// These actions are synchronous WebGPU buffer/Budget acknowledgements. Their
// sequence never advances on a thrown value, including0/frozen primaries.
export function createConvolutionSyncRetirement(actions){
 actions=[...actions];let index=0,started=false,retired=false;
 return{get started(){return started;},get retired(){return retired;},release(){if(retired)return;started=true;while(index<actions.length){actions[index]();actions[index]=null;index++;}retired=true;}};
}
export function createConvolutionIndependentRetirement(owners){
 return createConvolutionSyncRetirement([()=>{let failed=false,primary;for(const owner of owners)try{owner.release();}catch(error){if(!failed){failed=true;primary=error;}}if(failed)throw primary;}]);
}
export function preserveConvolutionPrimary(primary,cleanup){
 if(primary!==null&&(typeof primary==='object'||typeof primary==='function')&&Object.isExtensible(primary))try{primary.cleanupErrors=[...(primary.cleanupErrors??[]),cleanup];}catch{}
}
