import {sha256} from './dependency-core.js?v=0.23.0';
import {offlineLauncherHTML,validateOfflineShell} from './offline-kit-core.js?v=0.23.0';
import {offlineCacheName} from './offline-browser-store.js?v=0.23.0';
import {readVerifiedResponse} from './local-update-core.js?v=0.23.0';
import {getDocumentDownloadShelf} from './download-shelf.js?v=0.23.0';

export async function createOfflineLauncherDownload(plan,{language='fr',fetcher=globalThis.fetch,storage=globalThis.caches,crypto=globalThis.crypto,signal}={}){
 if(!plan?.shellBytes||!plan.manifestBytes||await sha256(plan.shellBytes)!==plan.identity)throw Error('Offline launcher shell identity differs');
 const shell=validateOfflineShell(JSON.parse(new TextDecoder().decode(plan.shellBytes)));
 if(await sha256(plan.manifestBytes)!==shell.manifest)throw Error('Offline launcher manifest identity differs');
 const meta=shell.files['offline-server.py'];if(!meta)throw Error('Verified Python launcher unavailable');
 const appBase=new URL(plan.appBase),cached=storage&&await(await storage.open(offlineCacheName(plan.identity))).match(new URL('offline-server.py',appBase));
 let bytes;
 if(cached)try{bytes=await readVerifiedResponse(cached,meta.size,meta.sha256,{signal});}catch{}
 if(!bytes){const source=plan.remoteAssetBase||plan.sourceBase||appBase,url=new URL(meta.source||'offline-server.py',plan.local?appBase:source);bytes=await readVerifiedResponse(await fetcher(url,{signal,credentials:'omit',referrerPolicy:'no-referrer'}),meta.size,meta.sha256,{signal});}
 const existing=appBase.protocol==='http:'&&appBase.hostname==='127.0.0.1'&&appBase.pathname.match(/^\/([a-f0-9]{32})\/$/),existingPort=Number(appBase.port),preserve=!!existing&&Number.isInteger(existingPort)&&existingPort>=1024&&existingPort<=65535;
 const token=preserve?existing[1]:[...crypto.getRandomValues(new Uint8Array(16))].map(value=>value.toString(16).padStart(2,'0')).join(''),config={schema:'sherloq.offline-launcher/1',archivePath:'SHERLOQ-complet.tar',manifest:shell.manifest,shellSha256:plan.identity,version:shell.version,port:preserve?existingPort:8765,token};
 const server=new TextDecoder('utf-8',{fatal:true}).decode(bytes),html=offlineLauncherHTML({...config,language,server,entry:shell.files['offline-bridge.html']?'offline-bridge.html':'app.html'});
 return {html,config};
}

export function downloadOfflineLauncher(document,html,{download}={}){
 return(download??getDocumentDownloadShelf(document).download)(new Blob([html],{type:'text/html;charset=utf-8'}),'SHERLOQ.html',{mime:'text/html;charset=utf-8'});
}
