// Retire every independent owner, preserving a calculation error if one exists.
export async function retireCompositeOwners(owners, options={}) {
 const primary=Object.hasOwn(options,'primary');let failed=primary,failure=options.primary;
 for(const retire of owners)try{await retire?.();}catch(error){
  if(!failed){failed=true;failure=error;}
  else if(failure&&typeof failure==='object')try{(failure.cleanupErrors??=[]).push({name:error?.name??'Error',code:error?.code,message:String(error?.message??error)});}catch{}
 }
 if(failed&&!primary)throw failure;
}
