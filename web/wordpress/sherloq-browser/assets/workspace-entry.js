import {prepareDependencies} from './dependency-bootstrap.js';
try{
 await prepareDependencies();
 const {mountWorkspace}=await import('./workspace.js');
 mountWorkspace();
}catch(error){
 const status=document.getElementById('workspace-status');
 if(status)status.textContent=error.message;
 console.error(error);
}
