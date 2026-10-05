import {storageInventory} from './source-api-browser.js';
export async function automaticExportBrowserTest({backend='opfs'}={}){const before=await storageInventory(),result=await new Promise((resolve,reject)=>{const worker=new Worker(new URL('./automatic-export-proof-worker.js',import.meta.url),{type:'module'});worker.onmessage=({data})=>{worker.terminate();data.error?reject(Error(data.error)):resolve(data);};worker.onerror=e=>{worker.terminate();reject(Error(e.message));};worker.postMessage({backend});});if(JSON.stringify(before)!==JSON.stringify(await storageInventory()))throw Error('Global export storage leak');return {...result,storageCleanup:true};}

export const automaticExportIndexedDbBrowserTest=()=>automaticExportBrowserTest({backend:'indexeddb'});
