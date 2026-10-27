import {readSettings,saveSettings,language,applyAppearance} from './settings.js';
let preferences=await readSettings();
function render(){
 applyAppearance(preferences);
 const lang=language(preferences);
 for(const node of document.querySelectorAll('[data-fr]'))node.textContent=node.dataset[lang];
 for(const node of document.querySelectorAll('article[lang]'))node.hidden=node.lang!==lang;
 document.getElementById('language').textContent=lang==='fr'?'EN':'FR';
 document.title=lang==='fr'?'SHERLOQ · Confidentialité':'SHERLOQ · Privacy';
}
document.getElementById('language').onclick=async()=>{preferences=await saveSettings({...await readSettings(),language:language(preferences)==='fr'?'en':'fr'});render();};
document.getElementById('theme').onclick=async()=>{preferences=await saveSettings({...await readSettings(),theme:document.documentElement.dataset.theme==='dark'?'light':'dark'});render();};
render();
