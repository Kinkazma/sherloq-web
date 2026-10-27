import {readSettings} from './settings.js';

// A browser origin owns its storage and local-server authorization. Borrow an
// existing SHERLOQ tab, or open a temporary inactive tab at the user's address.
// No filesystem path, extension ID, port scan or machine-specific address.
const sessions=new Map();
function matches(address,root){try{const url=new URL(address);return url.origin===root.origin&&url.pathname.startsWith(root.pathname.replace(/[^/]*$/,''));}catch{return false;}}
function context(preferences){
 const owned=new Map(),opening=new Map(),claimed=new Set();
 const onActivated=({tabId})=>{if(owned.has(tabId))claimed.add(tabId);};
 chrome.tabs.onActivated.addListener(onActivated);
 return {refs:0,timer:null,
  async sources(kind){
   const address=kind==='local'?preferences.localURL:preferences.webURL;if(!address)return [];
   const root=new URL(address);if(!['http:','https:','file:'].includes(root.protocol))return [];
   let tabs=(await chrome.tabs.query({})).filter(tab=>matches(tab.url,root));
   tabs.sort((a,b)=>Number(b.url?.split('#')[0]===root.href.split('#')[0])-Number(a.url?.split('#')[0]===root.href.split('#')[0]));
   if(!tabs.length){
    if(!opening.has(kind))opening.set(kind,(async()=>{const tab=await chrome.tabs.create({url:address,active:false});owned.set(tab.id,root);return tab;})());
    const tab=await opening.get(kind),deadline=Date.now()+15000;let loaded;
    do{loaded=await chrome.tabs.get(tab.id);if(loaded.status==='complete')break;await new Promise(resolve=>setTimeout(resolve,100));}while(Date.now()<deadline);
    tabs=[loaded];
   }
   const result=[];
   for(const tab of tabs)try{
    const frames=await chrome.scripting.executeScript({target:{tabId:tab.id,allFrames:true},func:()=>({url:location.href,workspace:!!document.getElementById('image-file')})});
    for(const frame of frames){const value=frame.result;if(!value||new URL(value.url).origin!==root.origin||frame.frameId!==0&&!value.workspace&&!matches(value.url,root))continue;result.push({tabId:tab.id,frameId:frame.frameId,url:value.url});}
   }catch{}
   return result;
  },
  async close(){
   for(const [id,root]of owned)try{const tab=await chrome.tabs.get(id);if(!claimed.has(id)&&!tab.active&&matches(tab.url,root))await chrome.tabs.remove(id);}catch{}
   chrome.tabs.onActivated.removeListener(onActivated);
   owned.clear();
  }
 };
}
export async function withLibraryTabs(run){
 const preferences=await readSettings(),key=JSON.stringify([preferences.localURL,preferences.webURL]);
 let session=sessions.get(key);if(!session){session=context(preferences);sessions.set(key,session);}
 clearTimeout(session.timer);session.refs++;
 try{return await run({sources:kind=>session.sources(kind),memo:new Map()});}finally{if(!--session.refs)session.timer=setTimeout(()=>{if(session.refs)return;sessions.delete(key);void session.close();},15000);}
}
export async function callLibrary(source,func,args){
 const results=await chrome.scripting.executeScript({target:{tabId:source.tabId,frameIds:[source.frameId]},func,args:[args]});
 return results[0]?.result;
}
