import {mountQuickHelp} from './help.js';
import {readSettings, saveSettings, language, applyAppearance} from './settings.js';
import {eventShortcut, shortcutDefaults, validateShortcuts, reservedShortcut, validateBindings} from './shortcuts.js';
import {controlFields} from './controls.js';
import {pruneJobs} from './db.js';
const $=id=>document.getElementById(id),form=$('preferences');let p=await readSettings();
const t=(fr,en)=>language(p)==='fr'?fr:en;
const quickHelp=mountQuickHelp({button:$('quick-help'),getPreferences:()=>p,language:()=>language(p)});
function notice(text,error=false){$('notice').textContent=text;$('notice').className=error?'error':'';}
async function commands(){const command=(await chrome.commands.getAll()).find(c=>c.name==='_execute_action');$('activation').textContent=command?.shortcut||t('Non attribué : conflit possible, ou raccourci retiré.','Unassigned: possible conflict, or shortcut removed.');$('activation').className=command?.shortcut?'':'error';}
function conflicts(){
 const values=Object.fromEntries([...form.querySelectorAll('[data-shortcut]')].map(input=>[input.dataset.shortcut,input.value]));
 const bindings=readBindings();
 const warnings=[];for(const [name,value]of Object.entries(values)){const reserved=reservedShortcut(value);if(reserved)warnings.push(value+' : '+reserved);}
 for(const b of bindings)for(const key of [b.decrease,b.increase]){const warning=reservedShortcut(key);if(warning)warnings.push(key+' : '+warning);}
 try{validateShortcuts(values);validateBindings(bindings,values);}catch(error){warnings.push(error.message);}
 $('conflicts').textContent=warnings.join(' ');$('conflicts').className=warnings.length?'error':'';form.querySelector('[type=submit]').disabled=!!warnings.length;return{values,bindings,warnings};
}
function renderBindings(){
 $('bindings').replaceChildren();for(const value of p.parameterBindings){
 const row=document.createElement('div');row.className='binding-row';row.dataset.binding=value.id;
 const target=document.createElement('select');target.dataset.target='';target.setAttribute('aria-label',t('Paramètre','Parameter'));for(const field of controlFields){const option=document.createElement('option');option.value=field[0];option.textContent=field[language(p)==='fr'?1:2];target.append(option);}target.value=value.target;
 const step=document.createElement('input');step.type='number';step.min=1;step.max=255;step.value=value.step;step.dataset.step='';step.setAttribute('aria-label',t('Pas','Step'));
 row.append(target,step);for(const key of ['decrease','increase']){const input=document.createElement('input');input.type='text';input.dataset.pairKey=key;input.value=value[key];input.setAttribute('aria-label',t(key==='decrease'?'Diminuer':'Augmenter',key==='decrease'?'Decrease':'Increase'));bindInput(input);row.append(input);}
 const remove=document.createElement('button');remove.type='button';remove.textContent='×';remove.setAttribute('aria-label',t('Retirer la paire','Remove pair'));remove.onclick=()=>{row.remove();conflicts();};row.append(remove);row.addEventListener('input',conflicts);$('bindings').append(row);
 }}
function readBindings(){return [...$('bindings').children].map(row=>({id:row.dataset.binding,target:row.querySelector('[data-target]').value,step:Number(row.querySelector('[data-step]').value),decrease:row.querySelector('[data-pair-key=decrease]').value,increase:row.querySelector('[data-pair-key=increase]').value}));}
$('add-binding').onclick=()=>{p.parameterBindings=readBindings();p.parameterBindings.push({id:'b'+crypto.randomUUID(),target:'adjust.width',step:1,decrease:'',increase:''});renderBindings();conflicts();};
function render(){quickHelp.sync();renderBindings();applyAppearance(p);for(const key of ['webURL','localURL','font','language','theme'])form.elements[key].value=p[key];for(const input of form.querySelectorAll('[data-shortcut]'))input.value=p.shortcuts[input.dataset.shortcut];for(const node of document.querySelectorAll('[data-fr]'))node.textContent=node.dataset[language(p)];$('language').textContent=language(p)==='fr'?'EN':'FR';conflicts();void commands();}
function bindInput(input){
 input.addEventListener('focus',()=>input.select());input.addEventListener('input',conflicts);
 input.addEventListener('keydown',event=>{if(event.key==='Tab'||event.key.toLowerCase()==='v'&&(event.ctrlKey||event.metaKey))return;event.preventDefault();const combo=eventShortcut(event);if(combo){input.value=combo;conflicts();}});
}
for(const input of form.querySelectorAll('[data-shortcut]'))bindInput(input);
$('reset-shortcuts').onclick=()=>{for(const input of form.querySelectorAll('[data-shortcut]'))input.value=shortcutDefaults[input.dataset.shortcut];conflicts();};
$('browser-shortcuts').onclick=()=>void chrome.tabs.create({url:'chrome://extensions/shortcuts'});
form.onsubmit=async event=>{event.preventDefault();try{const {values,bindings,warnings}=conflicts();if(warnings.length)return;const value={...await readSettings(),shortcuts:values,parameterBindings:bindings};for(const key of ['webURL','localURL','font','language','theme'])value[key]=form.elements[key].value.trim();p=await saveSettings(value);render();notice(t('Réglages enregistrés.','Settings saved.'));}catch(error){notice(error.message,true);}};
for(const key of ['font','language','theme'])form.elements[key].onchange=()=>{p[key]=form.elements[key].value;applyAppearance(p);};
$('theme').onclick=async()=>{p=await saveSettings({...await readSettings(),theme:document.documentElement.dataset.theme==='dark'?'light':'dark'});render();};
$('language').onclick=async()=>{p=await saveSettings({...await readSettings(),language:language(p)==='fr'?'en':'fr'});render();};
$('restart').onclick=async()=>{notice(t('Redémarrage…','Restarting…'));const response=await chrome.runtime.sendMessage({type:'restart'});notice(response?.ok?t('Extension redémarrée.','Extension restarted.'):response?.error||t('Redémarrage impossible.','Could not restart.'));};
$('clear-cache').onclick=async()=>{await pruneJobs({all:true});await caches.delete('sherloq-pdf-subimage-domains-v1');notice(t('Images temporaires supprimées.','Temporary images deleted.'));};
addEventListener('focus',()=>void commands());render();const error=new URLSearchParams(location.search).get('error');if(error)notice(error,true);
