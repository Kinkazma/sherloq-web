const app=document.getElementById('workspace-app'),notice=document.getElementById('startup-notice');
const explicit=new URLSearchParams(location.hash.slice(1)).get('lang');let saved;
try{saved=JSON.parse(localStorage.getItem('sherloq.workspace.preferences'))?.language;}catch{}
const preferred=[explicit,saved,...(navigator.languages||[navigator.language])].map(value=>String(value||'').toLowerCase().split(/[-_]/)[0]).find(value=>value==='fr'||value==='en')||'en';
const messages=preferred==='fr'?{
 installing:'Préparation de SHERLOQ…',slow:'Le premier chargement prend un peu de temps. L’application s’ouvrira automatiquement dès qu’elle sera prête.',waiting:'Mise à jour prête. Fermez les autres fenêtres SHERLOQ lorsque leurs calculs sont terminés ; cette page poursuivra automatiquement.',opening:'Ouverture des outils…',retrying:'Connexion interrompue. Nouvelle tentative automatique…',failed:'Impossible de terminer le chargement.',retry:'Réessayer',reload:'Recharger'
}:{installing:'Preparing SHERLOQ…',slow:'The first load is taking a little longer. The application will open automatically when ready.',waiting:'Update ready. Close other SHERLOQ windows after their calculations finish; this page will continue automatically.',opening:'Opening tools…',retrying:'Connection interrupted. Retrying automatically…',failed:'Unable to finish loading.',retry:'Retry',reload:'Reload'};
document.documentElement.lang=preferred;
const show=key=>{if(notice)notice.textContent=messages[key]||key;};
let running=false,workspaceStarted=false;
async function start(){
 if(running)return;running=true;if(app)app.inert=true;show('installing');
 try{
  const {prepareDependencies}=await import('./dependency-bootstrap.js');
  for(let attempt=0;;attempt++){
   try{await prepareDependencies({onStatus:show});break;}
   catch(error){if(attempt>=2)throw error;show('retrying');await new Promise(resolve=>setTimeout(resolve,1000*2**attempt));}
  }
  show('opening');const {mountWorkspace}=await import('./workspace.js');
  workspaceStarted=true;mountWorkspace();if(app)app.inert=false;notice?.remove();document.documentElement.dataset.workspaceReady='true';
 }catch(error){
  show('failed');if(notice){const detail=document.createElement('small');detail.textContent=error.message;notice.append(detail);const retry=document.createElement('button');retry.type='button';retry.textContent=messages[workspaceStarted?'reload':'retry'];retry.onclick=()=>workspaceStarted?location.reload():start();notice.append(retry);}
  console.error(error);
 }finally{running=false;}
}
void start();
