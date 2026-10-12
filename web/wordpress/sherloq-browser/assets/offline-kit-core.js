import {sha256} from './dependency-core.js';
import {safeTarPath} from './dependency-tar.js';
export function validateOfflineShell(value){
 if(value?.schema!=='sherloq.offline-shell/1'||!value.files||!/^[a-f0-9]{64}$/.test(value.manifest))throw Error('Invalid offline shell');
 for(const [path,file]of Object.entries(value.files))if(!safeTarPath(path)||path.startsWith('private')||(file.source&&!safeTarPath(file.source))||!Number.isSafeInteger(file.size)||file.size<0||file.size>20_000_000||!/^[a-f0-9]{64}$/.test(file.sha256))throw Error('Invalid offline shell file');
 for(const path of ['app.html','workspace-entry.js','offline-server.py'])if(!value.files[path])throw Error('Incomplete offline shell');
 return value;
}
export async function readOfflineShell(scope,fetcher=fetch){
 const response=await fetcher(new URL('offline-shell.json',scope));if(!response.ok)throw Error('Offline application package unavailable');
 return validateOfflineShell(await response.json());
}
export async function* offlineShellParts(shell,scope,{fetcher=fetch,signal}={}){
 yield ['offline-kit.json',new TextEncoder().encode(JSON.stringify(shell)+'\n')];
 for(const [path,file]of Object.entries(shell.files)){
  signal?.throwIfAborted();const response=await fetcher(new URL(file.source||path,scope),{signal,credentials:'omit'});if(!response.ok)throw Error('Offline application file unavailable: '+path);
  const bytes=new Uint8Array(await response.arrayBuffer());if(bytes.length!==file.size||await sha256(bytes)!==file.sha256)throw Error('Offline application integrity failure: '+path);
  yield ['app/'+path,bytes];
 }
}
const escapeHTML=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function offlineLauncherHTML({archivePath,manifest,shellSha256,version,port=8765,token,language='fr',server}){
 if(!archivePath?.trim()||/[\x00-\x1f]/.test(archivePath)||!token?.match(/^[a-f0-9]{32}$/)||!manifest?.match(/^[a-f0-9]{64}$/)||!Number.isInteger(port)||port<1024||port>65535)throw Error('Invalid offline launcher settings');
 if(!shellSha256?.match(/^[a-f0-9]{64}$/))throw Error('Missing offline shell identity');
 const fr=language!=='en',config={schema:'sherloq.offline-launcher/1',archivePath:archivePath.trim(),manifest,shellSha256,version,port,token};
 const data=JSON.stringify(config).replace(/</g,'\\u003c'),address='http://127.0.0.1:'+port+'/'+token+'/app.html#lang='+(fr?'fr':'en');
 // A path is private configuration, never interpolated into executable code.
 // The helper reads this JSON and serves only the archive over loopback.
 const source=JSON.stringify(server).replace(/</g,'\\u003c');
 return `<!doctype html><html lang="${fr?'fr':'en'}"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'none'; img-src data:; base-uri 'none'; form-action 'none'"><title>SHERLOQ — ${fr?'hors ligne':'offline'}</title><style>body{max-width:52rem;margin:5vh auto;padding:2rem;background:#17191d;color:#eee;font:20px system-ui;line-height:1.5}a,button{display:inline-block;background:#326bb2;color:white;border:0;border-radius:.4rem;padding:.65rem 1rem;font:inherit;cursor:pointer}code{display:block;white-space:pre-wrap;overflow-wrap:anywhere;background:#252932;padding:1rem}small{color:#bbb}</style><h1>SHERLOQ ${escapeHTML(version)}</h1><p>${fr?'Votre application locale. Les moteurs et leurs fichiers restent dans l’archive standard, sans connexion au site ou à GitHub.':'Your local application. Engines and their original files stay in the standard archive, without connecting to the site or GitHub.'}</p><p>${fr?'Archive enregistrée :':'Saved archive:'}</p><code>${escapeHTML(archivePath)}</code><p>${fr?'Placez le lanceur autonome SHERLOQ fourni avec le kit à côté de ce HTML, puis ouvrez-le. Il ouvre votre navigateur habituel et reste actif pendant les calculs. Aucun Python n’est nécessaire avec ce lanceur.':'Place the standalone SHERLOQ launcher supplied with the kit beside this HTML, then open it. It opens your usual browser and stays running during calculations. This launcher needs no Python.'}</p><details><summary>${fr?'Autre possibilité : lanceur Python':'Alternative: Python launcher'}</summary><p>${fr?'Au premier lancement, téléchargez le petit lanceur ci-dessous dans le même dossier que ce HTML. Python 3.10 ou plus récent doit être installé. Depuis ce dossier, exécutez :':'First, save the small launcher below beside this HTML. Python 3.10 or newer must be installed. From that folder, run:'}</p><code>python3 sherloq-local.py SHERLOQ.html</code><p>${fr?'Sous Windows, utilisez « py -3 » à la place de « python3 ». Gardez le lanceur ouvert pendant les calculs. Il ouvre automatiquement le navigateur ; les sessions suivantes utilisent la même commande.':'On Windows, use “py -3” instead of “python3”. Keep the launcher running during calculations. It opens the browser automatically; use the same command for later sessions.'}</p><button id="helper">${fr?'Télécharger le lanceur Python':'Download Python launcher'}</button></details><p><a href="${address}">${fr?'Ouvrir SHERLOQ local':'Open local SHERLOQ'}</a></p><p><small>${fr?'Le chemin mémorisé ne donne pas au navigateur le droit de lire le disque. Ce lanceur est nécessaire pour préserver tous les moteurs et la mémoire partagée. Aucun compte, cookie ni accès Internet n’est nécessaire. L’archive n’est pas extraite ni copiée en mémoire entière.':'A saved path does not grant browser disk access. The launcher preserves all engines and shared memory. No account, cookie or Internet access is required. The archive is not extracted or loaded entirely into RAM.'}</small></p><script id="sherloq-offline-config" type="application/json">${data}</script><script>document.getElementById('helper').onclick=()=>{const u=URL.createObjectURL(new Blob([${source}],{type:'text/x-python'})),a=document.createElement('a');a.href=u;a.download='sherloq-local.py';a.click();setTimeout(()=>URL.revokeObjectURL(u),60000);};</script></html>`;
}
