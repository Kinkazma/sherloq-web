/** User consent changes one calculation's source, never its saved regions. */
export function validateWholeSourceFallbacks(value={}){
 if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).length>256)throw new TypeError('Invalid whole-source fallback preferences.');
 const result={};
 for(const [operation,enabled]of Object.entries(value)){
  if(operation.length>120||!/^[a-z][a-zA-Z0-9]*(?:\.[a-zA-Z0-9]+)*$/.test(operation)||typeof enabled!=='boolean')throw new TypeError('Invalid whole-source fallback preference.');
  result[operation]=enabled;
 }
 return result;
}

export function createWholeSourceFallbackUI({document,language=()=> 'fr',getPreferences=()=>({}),setPreferences=()=>{},toolLabel=id=>id}={}){
 let queue=Promise.resolve();
 const node=(tag,text)=>{const el=document.createElement(tag);if(text!==undefined)el.textContent=text;return el;};
 const text=(fr,en)=>language()==='en'?en:fr;
 function modal(title){const dialog=node('dialog');dialog.className='whole-source-fallback-dialog';dialog.style.maxWidth='38rem';dialog.append(node('h2',title));document.body.append(dialog);return dialog;}
 async function ask({operation,reason,isCurrent=()=>true}={}){
  if(!await isCurrent())return false;
  const preferences=validateWholeSourceFallbacks(getPreferences());
  if(preferences[operation]===true)return true;
  const dialog=modal(text('Analyser toute l’image ?','Analyse the whole image?'));
  dialog.append(node('p',toolLabel(operation)),node('p',reason),node('p',text('Cette analyse utilisera l’image originale entière. Vos acquisitions et exclusions sont conservées.','This calculation will use the complete original image. Your acquisition and exclusion regions are kept.')));
  const label=node('label'),always=node('input');always.type='checkbox';always.checked=false;label.append(always,node('span',text(' Toujours faire ainsi pour cet outil lorsque les zones ne sont pas prises en charge',' Always do this for this tool when regions are unsupported')));dialog.append(label);
  const actions=node('div');actions.className='row';const cancel=node('button',text('Annuler','Cancel')),allow=node('button',text('Analyser l’image entière','Analyse the whole image'));cancel.type=allow.type='button';actions.append(cancel,allow);dialog.append(actions);
  let settled=false;
  try{return await new Promise((resolve,reject)=>{
   const finish=async accepted=>{if(settled)return;settled=true;try{const current=await isCurrent();if(accepted&&current&&always.checked)setPreferences({...validateWholeSourceFallbacks(getPreferences()),[operation]:true});resolve(accepted&&current);}catch(error){reject(error);}finally{dialog.close();}};
   cancel.onclick=()=>void finish(false);allow.onclick=()=>void finish(true);dialog.oncancel=e=>{e.preventDefault();void finish(false);};dialog.onclose=()=>{if(!settled){settled=true;resolve(false);}};dialog.showModal();
  });}finally{dialog.remove();}
 }
 return{
  request(options){const next=queue.catch(()=>{}).then(()=>ask(options));queue=next;return next;},
  configure(){
   const preferences=validateWholeSourceFallbacks(getPreferences()),dialog=modal(text('Repli sur l’image entière','Whole-image fallback'));
   dialog.append(node('p',text('Ces accords concernent uniquement les outils qui ne prennent pas en charge les zones. Décochez un outil pour demander à nouveau confirmation.','These agreements apply only when a tool does not support regions. Uncheck a tool to require confirmation again.')));
   const operations=Object.keys(preferences).filter(id=>preferences[id]);
   if(!operations.length)dialog.append(node('p',text('Aucun accord permanent enregistré.','No permanent agreement saved.')));
   for(const operation of operations){const label=node('label'),input=node('input');input.type='checkbox';input.checked=true;label.style.display='block';label.append(input,node('span',' '+toolLabel(operation)));input.onchange=()=>setPreferences({...validateWholeSourceFallbacks(getPreferences()),[operation]:input.checked});dialog.append(label);}
   const close=node('button',text('Fermer','Close'));close.type='button';close.onclick=()=>dialog.close();dialog.append(close);dialog.onclose=()=>dialog.remove();dialog.showModal();
  }
 };
}
