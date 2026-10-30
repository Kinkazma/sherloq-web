import "../../runtime-context.js?v=0.30.0";
import {serializeEngineError} from './errors.js';
/** Retire independent owners without replacing the operation's primary error. */
export async function retireForgeryscopeOwners(actions,options={}){
 let failed=Object.hasOwn(options,'primary'),failure=options.primary;
 for(const action of actions)try{await action?.();}catch(error){if(!failed){failed=true;failure=error;}else if(failure&&typeof failure==='object'&&Object.isExtensible(failure))try{failure.details={...failure.details,cleanupErrors:[...(failure.details?.cleanupErrors??[]),serializeEngineError(error)]};}catch{}}
 if(failed&&!Object.hasOwn(options,'primary'))throw failure;
}
