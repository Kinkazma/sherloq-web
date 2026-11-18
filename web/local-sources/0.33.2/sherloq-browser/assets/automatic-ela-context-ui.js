/** Presentation only. All native populations remain owned by the Core. */
export function createAutomaticElaContextControl({after,language=()=> 'fr',onChange=()=>{}}={}){
 if(!after?.ownerDocument)throw Error('The real automatic view control is required.');
 const document=after.ownerDocument,label=document.createElement('label'),caption=document.createElement('span'),select=document.createElement('select'),notice=document.createElement('output');
 select.id='automatic-ela-context';select.setAttribute('aria-label','Contexte natif ELA');notice.setAttribute('aria-live','polite');label.append(caption,select,notice);(after.closest('label')??after).after(label);let signature='',available=false;
 select.onchange=()=>onChange(select.value||null);
 function update(presentation,selectedId,{locked=false,complete=true}={}){
  const contexts=presentation?.contexts??[],valid=contexts.filter(c=>c.evaluable),fr=language()==='fr',next=JSON.stringify([fr,contexts.map(c=>[c.id,c.evaluable,c.originalBounds])]);
  available=complete&&!!presentation;label.hidden=!available;label.style.display=available?'':'none';select.disabled=locked||!valid.length;
  const prior=select.value,changed=next!==signature;if(changed){signature=next;select.replaceChildren();const original=document.createElement('option');original.value='';original.textContent=fr?'Original (sans contexte affiché)':'Original (no context displayed)';select.append(original);for(const [index,c]of contexts.entries()){const option=document.createElement('option');option.value=c.id;option.disabled=!c.evaluable;option.textContent=(fr?'Contexte ':'Context ')+(index+1)+' · '+c.originalBounds.join(', ');select.append(option);}}
  const validId=id=>valid.some(c=>c.id===id);let target=locked&&(!changed&&prior===''||validId(prior))?prior:selectedId===null?'':validId(selectedId)?selectedId:validId(prior)?prior:valid[0]?.id??'';select.value=target;
  caption.textContent=fr?'Contexte natif ELA':'Native ELA context';select.setAttribute('aria-label',caption.textContent);const c=presentation?.coverage;notice.textContent=available&&c?(fr?'Couverture ':'Coverage ')+c.coveredUniquePixels+' / '+c.selectedPixels+(fr?' pixels · observations ':' pixels · observations ')+c.contextRgbPositions:'';
  return {available,value:select.value||null};
 }
 update(null,undefined);
 return{update,get value(){return select.value||null;},get available(){return available;},element:label,select,dispose(){select.onchange=null;label.remove();}};
}
