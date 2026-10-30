import {applyLoupePreset,currentLoupePreset} from './presets.js';
import {presetStorageKey,readNamedPresets} from './preset-library.js';
import {validateLoupeEffects} from './effects-settings.js';

export function mountPresetControls({root,getLoupe,apply,send,language,status,modal=()=>{}}){
 const doc=root.ownerDocument,$=id=>root.querySelector('#'+id),select=$('loupe-preset'),add=$('preset-save'),remove=$('preset-remove');
 const t=(fr,en)=>language()==='fr'?fr:en;let records=[],preferred=null,busy=false,closed=false,revision=0;
 const dialog=doc.createElement('dialog');dialog.className='preset-dialog';dialog.id='preset-dialog';dialog.innerHTML='<form><h2 id="preset-dialog-title"></h2><p id="preset-dialog-description"></p><label id="preset-name-row"><span></span><input id="preset-name" type="text" maxlength="80" required autocomplete="off"></label><p id="preset-error" role="alert"></p><div class="compact-actions"><button id="preset-cancel" type="button"></button><button id="preset-confirm" type="submit"></button></div></form>';dialog.setAttribute('aria-labelledby','preset-dialog-title');doc.body.append(dialog);
 const node=id=>dialog.querySelector('#'+id),field=node('preset-name');let action=null;
 const same=record=>JSON.stringify(record.effects)===JSON.stringify(getLoupe().effects);
 function sync(){
  const current=getLoupe(),builtin=currentLoupePreset(current),selected=preferred&&((records.find(record=>record.id===preferred)&&same(records.find(record=>record.id===preferred)))||preferred===builtin)?preferred:builtin==='custom'?records.find(same)?.id??'custom':builtin;
  select.value=selected;remove.disabled=busy||!records.some(record=>record.id===selected);add.disabled=busy;add.title=add.ariaLabel=t('Enregistrer un préréglage','Save a preset');remove.title=remove.ariaLabel=t('Supprimer ce préréglage personnel','Delete this saved preset');
 }
 async function refresh(){const ticket=++revision,list=await readNamedPresets();if(closed||ticket!==revision)return;records=list;for(const option of select.querySelectorAll('[data-user-preset]'))option.remove();for(const record of records){const option=doc.createElement('option');option.dataset.userPreset='';option.value=record.id;option.textContent=record.name;select.insertBefore(option,select.querySelector('[value=custom]'));}sync();}
 function close(){if(dialog.open)dialog.close();}
 function show(kind){
  if(busy)return;action={kind,id:select.value,effects:structuredClone(getLoupe().effects)};const record=records.find(record=>record.id===action.id);if(kind==='remove'&&!record)return;
  node('preset-dialog-title').textContent=kind==='save'?t('Enregistrer un préréglage','Save a preset'):t('Supprimer le préréglage','Delete preset');node('preset-dialog-description').textContent=kind==='save'?t('Les effets actuels seront enregistrés.','The current effects will be saved.'):t('Supprimer « ','Delete “')+record.name+(language()==='fr'?' » ?':'”?');node('preset-name-row').hidden=kind!=='save';node('preset-name-row').querySelector('span').textContent=t('Nom','Name');field.disabled=kind!=='save';field.value='';field.setCustomValidity('');node('preset-error').textContent='';node('preset-cancel').textContent=t('Annuler','Cancel');node('preset-confirm').textContent=kind==='save'?t('Enregistrer','Save'):t('Supprimer','Delete');dialog.showModal();modal(true);(kind==='save'?field:node('preset-cancel')).focus({preventScroll:true});
 }
 select.onchange=()=>{preferred=select.value;const record=records.find(record=>record.id===preferred);apply(record?{...getLoupe(),effects:validateLoupeEffects(record.effects)}:applyLoupePreset(getLoupe(),preferred),record?null:preferred);sync();};
 add.onclick=()=>show('save');remove.onclick=()=>show('remove');node('preset-cancel').onclick=close;
 dialog.querySelector('form').onsubmit=async event=>{event.preventDefault();if(busy)return;busy=true;const submitted=action;sync();node('preset-confirm').disabled=true;try{const result=await send(submitted.kind==='save'?{type:'preset-save',name:field.value,effects:submitted.effects}:{type:'preset-remove',id:submitted.id});if(submitted.kind==='save')preferred=result.id;else preferred=null;await refresh();close();status(submitted.kind==='save'?t('Préréglage enregistré.','Preset saved.'):t('Préréglage supprimé.','Preset deleted.'));}catch(error){node('preset-error').textContent=error.message;}finally{busy=false;node('preset-confirm').disabled=false;sync();}};
 dialog.addEventListener('close',()=>modal(false));dialog.addEventListener('click',event=>{const r=dialog.getBoundingClientRect();if(event.target===dialog&&(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom))close();});
 const changed=(changes,area)=>{if(area==='local'&&changes[presetStorageKey])void refresh().catch(error=>status(error.message));};chrome.storage.onChanged.addListener(changed);void refresh().catch(error=>status(error.message));sync();
 return {sync,dispose(){closed=true;chrome.storage.onChanged.removeListener(changed);close();dialog.remove();select.onchange=add.onclick=remove.onclick=null;}};
}
