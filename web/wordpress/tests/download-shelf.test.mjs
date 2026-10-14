import test from 'node:test';
import assert from 'node:assert/strict';
import {parseHTML} from 'linkedom';
import {createDownloadShelf} from '../sherloq-browser/assets/download-shelf.js';
import {createDownloadManager} from '../sherloq-browser/assets/download-manager.js';
const fixture=()=>parseHTML('<html lang="fr"><body><main><footer></footer></main></body></html>').document;
for(const nativeSaveSupported of [false,true])test('explicit exports dispatch each prepared file by default, native Save as available='+nativeSaveSupported,async()=>{
 const document=fixture(),dispatched=[],cleaned=new Map(),originalClick=document.defaultView.HTMLAnchorElement.prototype.click;let pickers=0;
 document.defaultView.HTMLAnchorElement.prototype.click=function(){assert.equal(document.body.contains(this),true);dispatched.push({filename:this.download,url:this.href});};
 const shelf=createDownloadShelf({document,managerFactory:options=>createDownloadManager({...options,...(nativeSaveSupported?{showSaveFilePicker(){pickers++;throw Error('Standard export must not open the native fallback.');}}:{})})});
 try{
  const filenames=['image.png','rapide.webp','image-affichee.tiff','rapport.pdf','dossier.zip','donnees.npz','journal.json'],leases=[];
  for(const [index,filename]of filenames.entries()){
   const bytes=Uint8Array.of(11,index,43,79),lease=await shelf.download({blob:new Blob([bytes]),storage:'opfs',cleanup:()=>cleaned.set(filename,(cleaned.get(filename)??0)+1)},filename);leases.push(lease);
   assert.equal(lease.state,'dispatched');assert.equal(lease.savedAt,undefined);assert.equal(dispatched[index].filename,filename);assert.equal(dispatched[index].url,lease.url);assert.deepEqual(new Uint8Array(await(await fetch(lease.url)).arrayBuffer()),bytes);assert.equal(shelf.manager.snapshot()[index].attempts,1);
  }
  assert.equal(dispatched.length,filenames.length);assert.equal(pickers,0);assert.equal(cleaned.size,0);assert.equal(shelf.element.querySelector('button').textContent,nativeSaveSupported?'Enregistrer sous…':'Télécharger');
  const preparedOnly=await shelf.download({blob:new Blob(['explicitly deferred']),storage:'opfs'},'prepare-only.png',{autoDispatch:false});assert.equal(preparedOnly.state,'ready');assert.equal(dispatched.length,filenames.length,'An explicit prepare-only request is still respected.');
  await shelf.dispose();assert.equal(cleaned.size,filenames.length);assert.ok([...cleaned.values()].every(count=>count===1));for(const lease of leases)await assert.rejects(fetch(lease.url));
 }finally{await shelf.dispose();document.defaultView.HTMLAnchorElement.prototype.click=originalClick;}
});
test('prepared downloads retain readable exact bytes and explicit release without exposing opaque URLs as page links',async()=>{
 const document=fixture();let cleaned=0;const shelf=createDownloadShelf({document,parent:document.querySelector('main'),before:document.querySelector('footer'),language:()=>document.documentElement.lang});
 const payload=new Blob(['exact bytes'],{type:'image/webp'}),lease=await shelf.download({blob:payload,storage:'opfs',cleanup:()=>cleaned++},'image.webp');
 assert.equal(shelf.element.querySelectorAll('a').length,0);assert.equal(shelf.element.querySelector('button').textContent,'Télécharger');assert.equal(await(await fetch(lease.url)).text(),'exact bytes');assert.equal(cleaned,0);assert.equal(shelf.element.nextElementSibling.tagName,'FOOTER');
 document.documentElement.lang='en';shelf.translate();assert.equal(shelf.element.querySelector('button').textContent,'Download');assert.equal(shelf.manager.snapshot()[0].url,lease.url);
 shelf.element.querySelector('button[aria-label="Remove prepared file: image.webp"]').click();await new Promise(r=>setImmediate(r));assert.equal(cleaned,1);assert.equal(shelf.element.hidden,true);await shelf.dispose();assert.equal(cleaned,1);
});
test('after a standard download, fallback Save as is a user action and reports Saved only after the destination writer closes',async()=>{
 const document=fixture(),writes=[];let close,closed=0;const gate=new Promise(r=>close=r);
 const shelf=createDownloadShelf({document,language:()=> 'fr',managerFactory:options=>createDownloadManager({...options,showSaveFilePicker:()=>({createWritable:async()=>({write:async bytes=>writes.push(...bytes),close:async()=>{await gate;closed++;},abort:async()=>{}})})})});
 const lease=await shelf.download({blob:new Blob(['unchanged']),storage:'opfs'},'source.webp');assert.equal(lease.state,'dispatched');assert.equal(shelf.manager.snapshot()[0].attempts,1);
 assert.equal(shelf.element.querySelector('button').textContent,'Enregistrer sous…');shelf.element.querySelector('button').click();await new Promise(r=>setImmediate(r));assert.equal(shelf.element.innerText.includes('Enregistré'),false);assert.equal(closed,0);
 close();await new Promise(r=>setImmediate(r));assert.equal(shelf.element.innerText.includes('Enregistré'),true);assert.equal(new TextDecoder().decode(Uint8Array.from(writes)),'unchanged');await shelf.dispose();
});

test('many compact prepared rows retain every exact file, independent save and cleanup, complete filenames and their scroll position',async()=>{
 const document=fixture(),saved=new Map(),cleaned=new Map(),files=[];
 const shelf=createDownloadShelf({document,language:()=>document.documentElement.lang,managerFactory:options=>createDownloadManager({...options,showSaveFilePicker:options=>{
  const chunks=[];return {createWritable:async()=>({write:async bytes=>chunks.push(new Blob([bytes])),close:async()=>saved.set(options.suggestedName,new Blob(chunks)),abort:async()=>chunks.length=0})};
 }})});
 async function prepare(index){
  const filename='SHERLOQ-complete-original-filename-with-long-source-name-and-method-'+index+'.webp',payload='Exact prepared bytes for independent file '+index,lease=await shelf.download({blob:new Blob([payload],{type:'image/webp'}),storage:'opfs',cleanup:()=>cleaned.set(filename,(cleaned.get(filename)??0)+1)},filename);
  files.push({filename,payload,lease});return files.at(-1);
 }
 for(let index=0;index<12;index++)await prepare(index);
 const list=shelf.element.querySelector('.download-shelf-list');list.scrollTop=257;await prepare(12);assert.equal(list.scrollTop,257);assert.equal(shelf.manager.retainedFiles,13);
 for(const file of files){
  const row=[...shelf.element.querySelectorAll('.download-shelf-row')].find(row=>row.querySelector('.download-shelf-name').textContent===file.filename);assert.ok(row);assert.equal(row.querySelector('.download-shelf-name').title,file.filename);assert.ok(row.querySelector('.download-shelf-label').title.startsWith(file.filename+' · '));assert.ok(row.querySelector('button[aria-label="Enregistrer sous : '+file.filename+'"]'));assert.equal(await(await fetch(file.lease.url)).text(),file.payload);
 }
 const chosen=files[7];shelf.element.querySelector('button[aria-label="Enregistrer sous : '+chosen.filename+'"]').click();await new Promise(resolve=>setImmediate(resolve));assert.equal(saved.size,1);assert.equal(await saved.get(chosen.filename).text(),chosen.payload);assert.equal(chosen.lease.state,'saved');assert.equal(list.scrollTop,257);assert.equal(cleaned.size,0);
 document.documentElement.lang='en';shelf.translate();assert.equal(list.scrollTop,257);assert.ok(shelf.element.querySelector('button[aria-label="Save as: '+chosen.filename+'"]'));
 const removed=files[3];shelf.element.querySelector('button[aria-label="Remove prepared file: '+removed.filename+'"]').click();await new Promise(resolve=>setImmediate(resolve));assert.equal(list.scrollTop,257);assert.equal(cleaned.size,1);assert.equal(cleaned.get(removed.filename),1);assert.equal(shelf.manager.retainedFiles,12);assert.equal(shelf.manager.snapshot().some(record=>record.id===removed.lease.id),false);await assert.rejects(fetch(removed.lease.url));
 for(const file of files.filter(file=>file!==removed)){assert.equal(cleaned.has(file.filename),false);assert.equal(await(await fetch(file.lease.url)).text(),file.payload);}
 await removed.lease.release();assert.equal(cleaned.get(removed.filename),1);await shelf.dispose();assert.equal(shelf.manager.retainedFiles,0);assert.equal(cleaned.size,files.length);assert.ok([...cleaned.values()].every(count=>count===1));
});
