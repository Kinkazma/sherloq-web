import {sessionLog} from './session-log.js?v=0.20.0';
import {diagnostic} from './runtime-context.js?v=0.20.0';
import {mountSessionControls,downloadSession} from './session-ui.js?v=0.20.0';
import {preferenceAccess,capturePreferenceBackup,downloadPreferenceBackup,importPreferenceBackup} from './preferences-recovery.js?v=0.20.0';
const app=document.getElementById('workspace-app'),notice=document.getElementById('startup-notice');
const explicit=new URLSearchParams(location.hash.slice(1)).get('lang');let saved;
try{saved=preferenceAccess.read('sherloq.workspace.preferences').value?.language;}catch{}
const preferred=[explicit,saved,...(navigator.languages||[navigator.language])].map(value=>String(value||'').toLowerCase().split(/[-_]/)[0]).find(value=>value==='fr'||value==='en')||'en';
const messages=preferred==='fr'?{
 installing:'Préparation de SHERLOQ…',slow:'Le premier chargement prend un peu de temps. L’application s’ouvrira automatiquement dès qu’elle sera prête.',waiting:'Préparation des ressources de cette fenêtre… Les autres fenêtres restent ouvertes.',opening:'Ouverture des outils…',retrying:'Connexion interrompue. Nouvelle tentative automatique…',failed:'Impossible de terminer le chargement.',retry:'Réessayer',reload:'Recharger'
}:{installing:'Preparing SHERLOQ…',slow:'The first load is taking a little longer. The application will open automatically when ready.',waiting:'Preparing this window’s resources… Other windows remain open.',opening:'Opening tools…',retrying:'Connection interrupted. Retrying automatically…',failed:'Unable to finish loading.',retry:'Retry',reload:'Reload'};
document.documentElement.lang=preferred;
const show=key=>{diagnostic({level:'info',kind:'startup',stage:key});if(notice)notice.textContent=messages[key]||key;};
let running=false;
async function start(){
 if(running)return;running=true;if(app)app.inert=true;show('installing');
 let stage='modules';
 try{
  const {prepareDependencies}=await import('./dependency-bootstrap.js?v=0.20.0');
  stage='dependencies';
  for(let attempt=0;;attempt++){
   try{await prepareDependencies({onStatus:show});break;}
   catch(error){if(attempt>=2)throw error;show('retrying');await new Promise(resolve=>setTimeout(resolve,1000*2**attempt));}
  }
  stage='workspace';show('opening');const {mountWorkspace}=await import('./workspace.js?v=0.20.0');
  const {initializeLocalManagement}=await import('./local-management-ui.js?v=0.20.0');
  const localManagement=await initializeLocalManagement();
  mountWorkspace(document,{localManagement});if(app)app.inert=false;notice?.remove();document.documentElement.dataset.workspaceReady='true';
 }catch(error){
  // A rejected ES module graph stays rejected for this document. Only the
  // dependency preparation can retry in place; import/mount failures need a
  // fresh document. No image or calculation exists at this startup boundary.
  const reload=stage!=='dependencies';
  show('failed');if(notice){const detail=document.createElement('small');detail.textContent=error.message;notice.append(detail);const retry=document.createElement('button');retry.type='button';retry.textContent=messages[reload?'reload':'retry'];retry.onclick=()=>reload?location.reload():start();notice.append(retry);}
  const logs=document.createElement('button');logs.textContent=preferred==='fr'?'Exporter le journal complet':'Export complete log';logs.onclick=()=>void downloadSession();notice?.append(logs);console.error(error);
  // Recovery stays reachable even when corrupted feature choices prevent the
  // scientific menus from opening. Never replace their unknown state by defaults.
  const rescue=document.createElement('button');rescue.textContent=preferred==='fr'?'Exporter la sauvegarde de réglages':'Export preference recovery backup';rescue.onclick=async()=>downloadPreferenceBackup(document,await capturePreferenceBackup());notice?.append(rescue);
  const restore=document.createElement('button'),backupFile=document.createElement('input');backupFile.type='file';backupFile.accept='application/json,.json';backupFile.hidden=true;restore.textContent=preferred==='fr'?'Restaurer une sauvegarde de réglages…':'Restore preference backup…';restore.onclick=()=>{backupFile.value='';backupFile.click();};backupFile.onchange=async()=>{try{const file=backupFile.files?.[0];if(!file)return;if(file.size>8_000_000)throw Error('Backup > 8 MB');downloadPreferenceBackup(document,await capturePreferenceBackup());await importPreferenceBackup(JSON.parse(await file.text()));location.reload();}catch(failure){const detail=document.createElement('small');detail.textContent=failure.message;notice?.append(detail);}};notice?.append(restore,backupFile);
 }finally{running=false;}
}
mountSessionControls();
void start();
