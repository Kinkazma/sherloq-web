// Use each control's declared default, including screen-scaled loupe dimensions.
export function bindSliderReset(input,initial,commit){
 input.addEventListener('dblclick',event=>{
  if(input.disabled)return;event.preventDefault();event.stopPropagation();
  const value=typeof initial==='function'?initial():initial;
  const min=input.min??input.getAttribute('min')??'',max=input.max??input.getAttribute('max')??'';
  input.value=Math.max(min===''?-Infinity:Number(min),Math.min(max===''?Infinity:Number(max),Number(value)));
  if(commit)commit();else{const Event=input.ownerDocument.defaultView.Event;input.dispatchEvent(new Event('input',{bubbles:true}));input.dispatchEvent(new Event('change',{bubbles:true}));}
 });
}
