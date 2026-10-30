import {createDownloadManager} from './download-manager.js?v=0.30.0';
import {resolveComputeProfile} from './resource-policy.js?v=0.30.0';
const shelves=new WeakMap();
// Keep prepared files in the tools dock until explicit removal. Only a
// completed destination write confirms that a native Save as succeeded.
export function createDownloadShelf(options={}){
 const {document=globalThis.document,parent=document.body,before=null,language=()=>document.documentElement.lang,onError=()=>{},managerFactory=createDownloadManager}=options;
 const existing=shelves.get(document);if(existing){existing.configure(options);if(Object.hasOwn(options,'parent')||Object.hasOwn(options,'before'))parent.insertBefore(existing.element,before);return existing;}
 const element=document.createElement('section');element.className='download-shelf';element.hidden=true;parent.insertBefore(element,before);
 const caption=document.createElement('p'),list=document.createElement('div');list.className='download-shelf-list';element.append(caption,list);
 let rows=[],disposed=false,disposal,currentLanguage=language,reportError=onError;
 const manager=managerFactory({document,memoryBudgetBytes:Math.floor(resolveComputeProfile('aggressive').memoryBudgetBytes/3),onError:error=>reportError(error),onChange:value=>{rows=value;render();}});
 function render(){
  if(disposed)return;const fr=(typeof currentLanguage==='function'?currentLanguage():currentLanguage)==='fr',scrollTop=list.scrollTop;
  element.hidden=!rows.length;element.setAttribute('aria-label',fr?'Fichiers prêts à enregistrer':'Files ready to save');caption.textContent=(fr?'Fichiers prêts':'Ready files')+' · '+rows.length;
  list.replaceChildren();
  for(const row of rows){
   const line=document.createElement('div');line.className='download-shelf-row';
   const label=document.createElement('div');label.className='download-shelf-label';
   const name=document.createElement('span');name.className='download-shelf-name';name.textContent=row.filename;name.title=row.filename;label.title=row.filename+' · '+(row.size/1024**2).toFixed(2)+' MiB';label.append(name);
   if(row.saveState==='saved'){const saved=document.createElement('small');saved.className='download-shelf-saved';saved.textContent=fr?'Enregistré':'Saved';label.append(saved);}
   if(row.copyState==='copied'){const copied=document.createElement('small');copied.className='download-shelf-copied';copied.textContent=fr?'JSON copié':'JSON copied';label.append(copied);}
   for(const [error,frLabel,enLabel]of[[row.copyError,'Copie impossible : ','Copy failed: '],[row.releaseError,'Retrait impossible : ','Removal failed: ']])if(error){const message=document.createElement('small');message.className='download-shelf-copy-error';message.setAttribute('role','status');message.textContent=(fr?frLabel:enLabel)+error.message;label.append(message);}
   const save=document.createElement('button');save.type='button';save.textContent=manager.nativeSaveSupported?(fr?'Enregistrer sous…':'Save as…'):(fr?'Télécharger':'Download');save.setAttribute('aria-label',(manager.nativeSaveSupported?(fr?'Enregistrer sous : ':'Save as: '):(fr?'Télécharger : ':'Download: '))+row.filename);save.disabled=!!row.saving||!!row.copying||!!row.releasing;
   save.onclick=()=>{try{Promise.resolve(manager.nativeSaveSupported?manager.save(row.id):manager.dispatch(row.id)).catch(reportError);}catch(error){reportError(error);}};
   const copy=row.jsonCopyEligible?document.createElement('button'):null;if(copy){copy.type='button';copy.textContent=row.copying?(fr?'Copie…':'Copying…'):(fr?'Copier le JSON':'Copy JSON');copy.setAttribute('aria-label',(fr?'Copier le JSON : ':'Copy JSON: ')+row.filename);copy.disabled=!!row.saving||!!row.copying||!!row.releasing;copy.onclick=()=>{try{Promise.resolve(manager.copyText(row.id)).catch(error=>reportError(error&&typeof error==='object'?error:Object.assign(Error(String(error)),{code:'JSON_COPY_FAILED',cause:error})));}catch(error){reportError(error);}};}
   const close=document.createElement('button');close.type='button';close.textContent='×';close.setAttribute('aria-label',(fr?'Retirer la préparation : ':'Remove prepared file: ')+row.filename);close.onclick=()=>void manager.release(row.id).catch(reportError);
   line.append(label,save);if(copy)line.append(copy);line.append(close);list.append(line);
  }
  list.scrollTop=scrollTop;
 }
 const shelf={element,manager,configure(next){if(Object.hasOwn(next,'language'))currentLanguage=next.language;if(Object.hasOwn(next,'onError'))reportError=next.onError;render();},download:(value,name,options)=>manager.download(value,name,options),translate:render,dispose(){if(disposal)return disposal;disposed=true;if(shelves.get(document)===shelf)shelves.delete(document);element.remove();disposal=manager.dispose();return disposal;}};
 shelves.set(document,shelf);return shelf;
}
export function getDocumentDownloadShelf(document=globalThis.document){return shelves.get(document)??createDownloadShelf({document});}
