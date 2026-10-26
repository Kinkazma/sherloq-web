// A UI-only navigation window. Original numeric constraints and calculations
// remain owned by the original input and its established gesture handlers.
import {numericEditingIncrement} from './numeric-increment.js?v=0.25.0';
let nextPopup=0;
const inlineRangePresentations=new WeakMap(),inlineRangeOwners=new WeakMap(),inlineRangeOutputOwners=new WeakMap(),inlineRangeStyles=new WeakMap();
const finite=value=>value!==null&&value!==undefined&&String(value).trim()!==''&&Number.isFinite(Number(value))?Number(value):null;
const attribute=(input,key)=>finite(input.getAttribute?.(key));
const rounded=value=>Number.isInteger(value)||Math.abs(value)>=1e14?value:Number(value.toPrecision(14));
export const AUTOMATIC_SLIDER_EFFORT=Object.freeze({distance:32,milliseconds:180});
function automaticDescriptor(input,resolved={}){
 let automatic=resolved.automatic;const marker=input.getAttribute?.('data-hover-slider-automatic');
 if(marker){try{const value=JSON.parse(marker);automatic=value===null?{value:null,boundary:attribute(input,'min')}:value;}catch{}}
 if(!automatic||typeof automatic!=='object'||!Number.isFinite(automatic.boundary)||!(automatic.value===null||typeof automatic.value==='number'&&Number.isFinite(automatic.value)&&automatic.value<automatic.boundary))return null;
 const min=attribute(input,'min'),max=attribute(input,'max');if(automatic.value!==null&&(min!==null&&automatic.value<min||max!==null&&automatic.value>max))return null;
 return{value:automatic.value,boundary:automatic.boundary};
}
export function numericSliderWindow(input,resolved={},previous){
 const automatic=automaticDescriptor(input,resolved),nativeMin=attribute(input,'min'),nativeMax=attribute(input,'max'),extraMin=automatic?Math.max(finite(resolved?.min)??-Infinity,automatic.boundary):finite(resolved?.min),extraMax=finite(resolved?.max),min=nativeMin===null?extraMin:extraMin===null?nativeMin:Math.max(nativeMin,extraMin),max=nativeMax===null?extraMax:extraMax===null?nativeMax:Math.min(nativeMax,extraMax),rawStep=input.getAttribute?.('step'),step=rawStep==='any'?'any':finite(rawStep)>0?Number(rawStep):1,quantum=step==='any'?0:step,rawValue=finite(input.value),base=nativeMin??attribute(input,'value')??0;
 if(min!==null&&max!==null&&(max<min||max===min&&!automatic))return null;
 const isAutomatic=!!automatic&&(automatic.value===null?rawValue===null:rawValue===automatic.value),value=Math.max(min??-Infinity,Math.min(max??Infinity,isAutomatic?min:rawValue??min??0)),align=(v,direction)=>quantum?rounded(base+Math[direction]((v-base)/quantum)*quantum):rounded(v),half=Math.max(quantum*10,10**Math.floor(Math.log10(Math.max(Math.abs(value),quantum*10,1))));
 let low=min===null?align(value-half,'floor'):min===nativeMin?min:align(min,'ceil'),high=max===null?align(value+half,'ceil'):max===nativeMax?max:align(max,'floor');
 // Only the optional popup uses a progressive navigation window. Inline
 // native ranges keep their complete original scale, including Auto effort.
 const compactBounds=min!==null&&max!==null&&max-min<=10;
 // Small bounded intervals (gamma0..5, ratios0..1, etc.) remain directly reachable
 // even when their decimal editor deliberately uses step=any.
 if(resolved.navigation==='progressive'&&!compactBounds){const span=Math.max(quantum*100,10**Math.ceil(Math.log10(Math.max(Math.abs(value),1)))),edge=value>0?Number.EPSILON*Math.max(1,Math.abs(value)):0,start=Math.floor((value-edge)/span)*span;low=align(value===0&&(min===null||min<0)?-span:start,'floor');high=align(value===0&&(max===null||max>0)?span:start+span,'ceil');}
 if(!compactBounds&&previous&&previous.min===min&&previous.max===max&&previous.step===step){low=Math.min(previous.low,value);high=Math.max(previous.high,value);}
 low=Math.max(min??-Infinity,low);high=Math.min(max??Infinity,high);if(!Number.isFinite(low)||!Number.isFinite(high)||high<low||high===low&&!automatic)return null;
 const admitted=automatic?.boundary===low?automatic:null;
 return{value,empty:rawValue===null,automaticActive:!!admitted&&isAutomatic,min,max,step,base,low,high,degenerate:low===high,extendLow:min===null||low>min,extendHigh:max===null||high<max,...(admitted?{automatic:admitted}:{})};
}
/** Reach the numeric minimum first. A fresh deliberate32px movement and180ms
 * contact are both required; a click, Home or ordinary key repeat cannot enter. */
export function createAutomaticSliderGate({now=()=>performance.now(),delay=(fn,ms)=>setTimeout(fn,ms),cancelDelay=clearTimeout,onAutomatic=()=>{}}={}){
 let held=false,contact=null,timer=null,epoch=0,entered=false;
 const clear=()=>{epoch++;if(timer!==null)cancelDelay(timer);timer=null;contact=null;};
 const qualify=()=>{if(!held||entered||!contact||contact.distance<AUTOMATIC_SLIDER_EFFORT.distance||now()-contact.at<AUTOMATIC_SLIDER_EFFORT.milliseconds)return false;entered=true;if(timer!==null)cancelDelay(timer);timer=null;onAutomatic();return true;};
 return{begin(){clear();held=true;entered=false;},move(x,minimum){if(!held)return false;if(x>minimum){clear();entered=false;return false;}if(entered)return true;if(!contact){contact={x,at:now(),distance:0};return false;}contact.distance=Math.max(0,contact.x-x);if(contact.distance<AUTOMATIC_SLIDER_EFFORT.distance){if(timer!==null)cancelDelay(timer);timer=null;return false;}if(qualify())return true;if(timer===null){const ticket=epoch;timer=delay(()=>{timer=null;if(ticket===epoch)qualify();},Math.max(0,AUTOMATIC_SLIDER_EFFORT.milliseconds-(now()-contact.at)));}return false;},end(){held=false;clear();entered=false;},get state(){return{held,entered,contact:contact?{...contact}:null};}};
}
function sliderRail(doc,range){const rail=doc.createElement('div'),zone=doc.createElement('span'),label=doc.createElement('span'),thumb=doc.createElement('span');rail.className='hover-slider-rail';zone.className='hover-slider-auto-zone';zone.setAttribute('aria-hidden','true');label.className='hover-slider-auto-label';label.textContent='Auto';zone.append(label);thumb.className='hover-slider-thumb';thumb.setAttribute('aria-hidden','true');rail.append(zone,range,thumb);return{rail,zone,thumb};}
function railDisplay(parts,range,d){const {rail,zone,thumb}=parts;rail.dataset.hasAutomatic=String(!!d.automatic);rail.dataset.automatic=String(!!d.automaticActive);rail.dataset.degenerate=String(!!d.degenerate);zone.hidden=!d.automatic;range.min=String(d.low);range.max=String(d.high);range.step=String(d.step);range.value=String(d.value);const r=range.getBoundingClientRect(),a=rail.getBoundingClientRect(),z=zone.getBoundingClientRect(),ratio=d.high===d.low?0:Math.max(0,Math.min(1,(Number(range.value)-d.low)/(d.high-d.low))),x=d.automaticActive?z.right-7:r.left+7+Math.max(0,r.width-14)*ratio;thumb.style.left=(x-a.left)+'px';}
function sliderValue(d,ratio){if(d.high===d.low)return d.low;const raw=d.low+(d.high-d.low)*ratio;return d.step==='any'?raw:Math.max(d.low,Math.min(d.high,rounded(d.base+Math.round((raw-d.base)/d.step)*d.step)));}
function automaticShortcut(e,d){return!!d?.automatic&&e.altKey&&e.key==='ArrowLeft'&&!e.ctrlKey&&!e.metaKey&&!e.shiftKey;}
function focusSlider(range){try{range.focus?.({preventScroll:true});}catch{range.focus?.();}}
function keyboardAutomatic(value,e,d){if(!d?.automatic||e.ctrlKey||e.metaKey||e.shiftKey||e.repeat)return undefined;if(e.altKey&&e.key==='ArrowLeft'&&(value===d.low||d.automaticActive))return d.automatic.value;if(!e.altKey&&d.automaticActive&&['ArrowRight','ArrowUp','Home'].includes(e.key))return d.low;return undefined;}
export function hoverSliderCorridor(point,field,popup,tolerance=.1){
 if(!point||!field||!popup)return false;const left=Math.min(field.left,popup.left),right=Math.max(field.right??field.left+field.width,popup.right??popup.left+popup.width),top=Math.min(field.top,popup.top),bottom=Math.max(field.bottom??field.top+field.height,popup.bottom??popup.top+popup.height),padX=Math.max(2,(right-left)*tolerance),padY=Math.max(2,(bottom-top)*tolerance);
 return point.x>=left-padX&&point.x<=right+padX&&point.y>=top-padY&&point.y<=bottom+padY;
}
export function installHoverSliders({root=globalThis.document,enabled=false,language=()=> 'fr',resolveRange=()=>null,hasSlider=()=>false,tolerance=.1,now=()=>performance.now(),delay=(fn,ms)=>setTimeout(fn,ms),cancelDelay=clearTimeout}={}){
 const doc=root.nodeType===9?root:root.ownerDocument??root.host?.ownerDocument,win=doc?.defaultView;if(!doc||!root.addEventListener)throw new TypeError('A DOM root is required.');
 let live=!!enabled,disposed=false,active=null,dismissed=null,langOverride=null,observer=null,nudgeTimer=null,textEditing=null;
 const listeners=[],listen=(target,type,fn,options)=>{target?.addEventListener?.(type,fn,options);listeners.push(()=>target?.removeEventListener?.(type,fn,options));},fr=()=>((langOverride??(typeof language==='function'?language():language))!=='en');
 const popup=doc.createElement('div'),range=doc.createElement('input'),lower=doc.createElement('button'),upper=doc.createElement('button'),limits=doc.createElement('div'),lowText=doc.createElement('span'),highText=doc.createElement('span'),header=doc.createElement('div'),nameText=doc.createElement('span'),currentText=doc.createElement('output');popup.id='hover-slider-'+(++nextPopup);popup.className='hover-slider-popup';popup.hidden=true;popup.setAttribute('role','group');popup.setAttribute('popover','manual');popup.dataset.hoverSliderPopup='';range.type='range';range.className='hover-slider-range';lower.type=upper.type='button';lower.className=upper.className='hover-slider-expand';lower.textContent='‹';upper.textContent='›';header.className='hover-slider-header';nameText.className='hover-slider-name';currentText.className='hover-slider-value';currentText.tabIndex=0;currentText.setAttribute('role','button');currentText.setAttribute('aria-keyshortcuts','Enter F2');header.append(nameText,currentText);lower.classList.add('hover-slider-expand-low');upper.classList.add('hover-slider-expand-high');limits.className='hover-slider-limits';limits.append(lowText,highText);const parts=sliderRail(doc,range),{rail}=parts;popup.append(header,lower,rail,upper,limits);const nudges=doc.createElement('span'),nudgeUp=doc.createElement('button'),nudgeDown=doc.createElement('button');nudges.className='hover-slider-nudges';for(const[button,direction,text]of[[nudgeUp,1,'▴'],[nudgeDown,-1,'▾']]){button.type='button';button.dataset.hoverSliderNudge=String(direction);button.textContent=text;nudges.append(button);}popup.append(nudges);
 const parent=()=>active?.input.closest?.('dialog[open]')??doc.body??doc.documentElement;
 const point=e=>Number.isFinite(e?.clientX)&&Number.isFinite(e?.clientY)?{x:e.clientX,y:e.clientY}:null;
 const inside=(e)=>!!active&&hoverSliderCorridor(point(e),active.input.getBoundingClientRect(),popup.getBoundingClientRect(),tolerance);
 function sourceOf(e){for(const node of e.composedPath?.()??[e.target])if(node?.tagName==='INPUT'&&node.type==='number')return node;return null;}
 function associatedSlider(input){
  if(hasSlider(input)||input.hasAttribute('data-no-hover-slider')||input.closest?.('[data-slider-popup],[data-hover-slider-popup]'))return true;
  if(input.getAttribute('aria-haspopup')&&!input.dataset.hoverSliderOwned)return true;
  const scope=input.getRootNode?.()??doc,ids=(input.getAttribute('aria-controls')??'').split(/\s+/).filter(Boolean);
  for(const id of ids){const linked=scope.getElementById?.(id);if(linked===popup&&active?.input===input)continue;if(linked&&(linked.type==='range'||linked.matches?.('[data-slider-popup],[data-hover-slider-popup]')))return true;}
  const label=input.closest?.('label');if(label?.querySelector('input[type="range"]'))return true;
  for(const label of input.labels??[])if(label.querySelector('input[type="range"]'))return true;
  return false;
 }
 function descriptor(input,previous){const value=finite(input.value),min=attribute(input,'min'),max=attribute(input,'max'),step=input.getAttribute('step')??'1',resolved={navigation:'progressive',...(resolveRange({input,value,min,max,step})??{})};return numericSliderWindow(input,resolved,previous);}
 function eligible(input){return !!input&&input.isConnected!==false&&!input.disabled&&!input.readOnly&&!input.hidden&&!associatedSlider(input)&&!!descriptor(input);}
 function title(){const label=active?.input.labels?.[0]??active?.input.closest?.('label'),text=active?.input.getAttribute('aria-label')??label?.textContent?.trim()?.replace(/\s+/g,' ').slice(0,100)??active?.input.id??'';nameText.textContent=text;range.setAttribute('aria-label',text||(fr()?'Valeur':'Value'));popup.setAttribute('aria-label',fr()?'Réglage par curseur':'Slider adjustment');lower.title=lower.ariaLabel=fr()?'Étendre la plage vers le bas':'Extend the range downward';upper.title=upper.ariaLabel=fr()?'Étendre la plage vers le haut':'Extend the range upward';}
 function position(){
  if(!active)return;const rect=active.input.getBoundingClientRect(),visual=win?.visualViewport,width=visual?.width??win?.innerWidth??1024,height=visual?.height??win?.innerHeight??768,leftOffset=visual?.offsetLeft??0,topOffset=visual?.offsetTop??0,margin=8,w=Math.max(1,Math.min(420,width-margin*2));
  popup.style.width=w+'px';railDisplay(parts,range,active.window);
  if(active.thumbOffset===null){const box=popup.getBoundingClientRect(),thumb=parts.thumb.getBoundingClientRect();active.thumbOffset=thumb.left+thumb.width/2-box.left;}
  const h=popup.getBoundingClientRect().height||30,left=rect.left+active.anchorOffset-active.thumbOffset;
  popup.style.left=Math.max(leftOffset+margin,Math.min(left,leftOffset+width-w-margin))+'px';
  popup.style.top=Math.max(topOffset+margin,Math.min(rect.top+(rect.height-h)/2,topOffset+height-h-margin))+'px';
 }
 function display(){if(!active)return;const d=active.window;railDisplay(parts,range,d);range.disabled=active.input.disabled||active.input.readOnly;lower.disabled=upper.disabled=range.disabled;nudgeUp.disabled=nudgeDown.disabled=range.disabled||active.input.step==='any'&&numericEditingIncrement(active.input)===null;nudgeUp.ariaLabel=fr()?'Augmenter la valeur':'Increase value';nudgeDown.ariaLabel=fr()?'Diminuer la valeur':'Decrease value';valueLabel();lower.hidden=!d.extendLow;upper.hidden=!d.extendHigh;lowText.textContent=String(d.low);highText.textContent=String(d.high);popup.dataset.extensible=String(d.extendLow||d.extendHigh);popup.title=d.extendLow||d.extendHigh?(fr()?'Plage de navigation extensible.':'Expandable navigation range.'):'';title();position();railDisplay(parts,range,d);}
 function valueLabel(){if(!active)return;const automatic=active.window.automaticActive;popup.dataset.automatic=String(automatic);const text=automatic?(fr()?'Automatique':'Automatic'):active.input.value;currentText.textContent=text;currentText.title=text;currentText.setAttribute('aria-description',fr()?'Double-cliquez pour saisir une valeur.':'Double-click to enter a value.');currentText.setAttribute('aria-label',text);range.title=text;if(automatic)range.setAttribute('aria-valuetext',text);else range.removeAttribute('aria-valuetext');railDisplay(parts,range,active.window);}
 // Edit the native owner only at commit; intermediate text never reaches a calculation.
 function valueOutput(e){return(e.composedPath?.()??[e.target]).find(node=>node?.tagName==='OUTPUT')??null;}
 function valueControl(output){
  if(output===currentText)return active?.input??null;if(!output)return null;const shared=inlineRangeOutputOwners.get(output);if(shared&&shared.scopes.values().next().value!==rangeScope)return null;if(rangeOutputs.has(output))return rangeOutputs.get(output);
  const scope=output.getRootNode?.()??doc,ids=(output.getAttribute('for')??'').split(/\s+/).filter(Boolean),linked=ids.map(id=>scope.getElementById?.(id)).filter(Boolean),label=output.closest?.('label'),previous=output.previousElementSibling,adjacent=previous?.matches?.('input[type="number"],input[type="range"]')?[previous]:previous?.tagName==='LABEL'?[...previous.querySelectorAll('input[type="number"],input[type="range"]')]:[],controls=linked.length?linked:label?[...label.querySelectorAll('input[type="number"],input[type="range"]')]:adjacent;
  return controls.find(input=>input.type==='number'&&!input.hidden)??controls.find(input=>input.type==='range'&&!input.classList?.contains('hover-slider-range'))??null;
 }
 function finishValueEdit(accept,e){
  const draft=textEditing;if(!draft)return true;const {input,output,editor}=draft;let serialized;
  if(accept&&input.isConnected!==false&&!input.disabled&&!input.readOnly){
   const text=editor.value.trim(),scale=displayScale(input),empty=text===''&&input.type==='number'&&!input.required,numeric=/^[+-]?(?:\d+(?:[.,]\d*)?|[.,]\d+)(?:e[+-]?\d+)?$/i.test(text)?Number(text.replace(',','.')):NaN;
   serialized=empty?'':Number.isFinite(numeric)?String(scale===1?numeric:rounded(numeric/scale)):null;const probe=doc.createElement('input');probe.type='number';for(const key of['min','max','step'])if(input.hasAttribute(key))probe.setAttribute(key,input.getAttribute(key));probe.required=input.type==='range'||input.required;probe.value=serialized??'';
   if(serialized===null||!probe.checkValidity()){editor.setCustomValidity((scale===1?probe.validationMessage:'')||(fr()?'Saisissez un nombre valide dans les limites du réglage.':'Enter a valid number within the control limits.'));editor.reportValidity();focusSlider(editor);return false;}
  }else accept=false;
  textEditing=null;editor.remove();output.hidden=draft.wasHidden;
  if(accept&&input.value!==serialized){input.value=serialized;input.dispatchEvent(event('input',e));if(input.isConnected!==false)input.dispatchEvent(event('change',e));}
  if(accept&&active?.input===input)refresh();return true;
 }
 function beginValueEdit(input,output,e){
  if(!input||input.disabled||input.readOnly||input.isConnected===false||textEditing?.input===input)return;if(!finishValueEdit(true,e))return;
  if(active?.nudgeHeld)endNudge(e,true);if(active?.dragging)release(e,true);
  const editor=doc.createElement('input');editor.type='text';editor.inputMode='decimal';editor.autocomplete='off';editor.spellcheck=false;editor.className='hover-slider-value-editor'+(output===currentText?' hover-slider-value':'');editor.value=input.value===''?'':displayScale(input)===1?input.value:String(rounded(Number(input.value)*displayScale(input)));editor.setAttribute('aria-label',(input.getAttribute('aria-label')||input.labels?.[0]?.textContent?.trim()||(fr()?'Valeur':'Value')));editor.dataset.hoverSliderEditor='';
  const wasHidden=output.hidden;if(output!==currentText){const width=output.getBoundingClientRect().width;if(width>0)editor.style.width=width+'px';}
  textEditing={input,output,editor,wasHidden};output.before(editor);output.hidden=true;if(active?.input===input){active.opening=false;popup.dataset.opening='false';}
  editor.addEventListener('input',()=>editor.setCustomValidity(''));editor.addEventListener('keydown',event=>{if(event.key==='Enter'){event.preventDefault();event.stopPropagation();if(finishValueEdit(true,event))focusSlider(input);}else if(event.key==='Escape'){event.preventDefault();event.stopPropagation();finishValueEdit(false,event);focusSlider(input);}});editor.addEventListener('blur',event=>{if(textEditing?.editor===editor)finishValueEdit(true,event);});focusSlider(editor);editor.select();
 }
 function writeAutomatic(e){if(!active?.window.automatic)return;const value=active.window.automatic.value,serialized=value===null?'':String(value),changed=active.input.value!==serialized;active.input.value=serialized;active.window.value=active.window.automatic.boundary;active.window.empty=value===null;active.window.automaticActive=true;range.value=String(active.window.value);valueLabel();if(changed)forward('input',e);}
 function applyBoundaryKey(input,e){const d=active?.input===input?active.window:descriptor(input),value=input.value===''?null:finite(input.value),answer=keyboardAutomatic(value,e,d),shortcut=automaticShortcut(e,d);if(shortcut)e.preventDefault();if(answer===undefined)return shortcut;e.preventDefault();if(answer===value)return true;if(active?.input===input&&answer===d.automatic.value)writeAutomatic(e);else{input.value=answer===null?'':String(answer);if(active?.input===input){active.window.value=answer??d.automatic.boundary;active.window.empty=answer===null;active.window.automaticActive=answer===d.automatic.value;display();}input.dispatchEvent(event('input',e));}if(e.altKey&&e.key==='ArrowLeft')input.dispatchEvent(event('change',e));return true;}
 function event(type,original){
  const C=type.startsWith('pointer')?win?.PointerEvent:type.startsWith('key')?win?.KeyboardEvent:win?.Event,props={bubbles:type!=='blur',composed:true,cancelable:true,...(type.startsWith('pointer')?{button:original?.button??0,buttons:original?.buttons??0,pointerId:original?.pointerId??active?.pointer??1,pointerType:original?.pointerType??'mouse',isPrimary:true,clientX:original?.clientX??0,clientY:original?.clientY??0}:{}),...(type.startsWith('key')?{key:original?.key,code:original?.code,repeat:original?.repeat??false,altKey:original?.altKey??false,ctrlKey:original?.ctrlKey??false,metaKey:original?.metaKey??false,shiftKey:original?.shiftKey??false}:{})};
  const value=new(C??win?.Event??Event)(type,props);for(const [key,item]of Object.entries(props))if(!(key in value))Object.defineProperty(value,key,{value:item});Object.defineProperty(value,'hoverSlider',{value:true});return value;
 }
 function forward(type,e){if(!active)return;const forwarded=event(type,e);active.input.dispatchEvent(forwarded);if(forwarded.defaultPrevented)e?.preventDefault?.();return forwarded;}
 function release(e,cancel=false){if(!active?.dragging)return;if(!active.nativeStart)forward(cancel?'pointercancel':'pointerup',e);active.dragging=false;active.gate.end();active.pointer=null;active.input.removeAttribute('data-hover-slider-active');}
 function hide(reason){if(!active)return;if(textEditing?.input===active.input)finishValueEdit(false);if(reason==='escape'||reason==='editing')dismissed={field:active.input.getBoundingClientRect(),popup:popup.getBoundingClientRect()};if(active.nudgeHeld)endNudge(undefined,true);if(active.dragging)release();active.gate.end();observer?.disconnect();observer=null;const old=active;old.dialog?.removeEventListener('close',old.closeDialog);active=null;for(const[key,value]of Object.entries(old.aria)){if(value===null)old.input.removeAttribute(key);else old.input.setAttribute(key,value);}old.input.removeAttribute('data-hover-slider-owned');try{popup.hidePopover?.();}catch{}popup.hidden=true;}
 function show(input,opening){
  if(!eligible(input))return false;hide();dismissed=null;active={input,window:descriptor(input),dragging:false,pointer:null,gate:null,nativeStart:false,pendingOpening:null,pointerOffset:0,changed:false,opening:true,anchorOffset:Number.isFinite(opening?.x)?opening.x-input.getBoundingClientRect().left:input.getBoundingClientRect().width/2,thumbOffset:null,nudgeHeld:null,aria:{'aria-controls':input.getAttribute('aria-controls'),'aria-expanded':input.getAttribute('aria-expanded')}};active.gate=createAutomaticSliderGate({now,delay,cancelDelay,onAutomatic:()=>{if(active&&!active.input.disabled&&!active.input.readOnly)writeAutomatic();}});input.dataset.hoverSliderOwned='true';input.setAttribute('aria-controls',popup.id);input.setAttribute('aria-expanded','true');parent().append(popup);popup.hidden=false;popup.dataset.opening='true';try{popup.showPopover?.();}catch{}display();
  active.dialog=input.closest?.('dialog[open]');if(active.dialog){active.closeDialog=()=>hide('dialog-close');active.dialog.addEventListener('close',active.closeDialog);}
  if(win?.MutationObserver){observer=new win.MutationObserver(refresh);observer.observe(input,{attributes:true,attributeFilter:['disabled','readonly','min','max','step','value','hidden']});}return true;
 }
 function refresh(){if(!active)return;if(!live||active.input.isConnected===false||active.input.hidden){hide();return;}const next=descriptor(active.input,active.window);if(!next){hide();return;}active.window=next;if(active.input.disabled||active.input.readOnly){active.gate.end();if(active.nudgeHeld)endNudge(undefined,true);}display();}
 function over(e){if(!live||disposed||textEditing||e.hoverSlider||e.pointerType==='touch')return;
  if(dismissed){if(hoverSliderCorridor(point(e),dismissed.field,dismissed.popup,tolerance))return;dismissed=null;}
  if(root!==doc&&!e.composedPath?.().includes(root)&&!root.contains?.(e.target))return;
  if(active){if(active.dragging||inside(e)||e.composedPath?.().includes(popup))return;hide();}const input=sourceOf(e);if(input)show(input,point(e));
 }
 function move(e){if(!live||disposed||textEditing||e.hoverSlider||e.pointerType==='touch')return;
  if(!active){over(e);return;}
  if(active.dragging){
   if(active.pointer!==undefined&&e.pointerId!==undefined&&active.pointer!==e.pointerId)return;
   if(e.buttons===0){endPointer(e,false);return;}
   if(active.pendingOpening){if(Math.hypot(e.clientX-active.pendingOpening.x,e.clientY-active.pendingOpening.y)<3)return;active.pendingOpening=null;active.opening=false;popup.dataset.opening='false';focusSlider(range);}
   if(!active.nativeStart)forward('pointermove',e);applyPointer(e);return;
  }
  if(active.nudgeHeld)return;
  const r=active.input.getBoundingClientRect(),p=point(e);if(active.opening&&p&&(p.x<r.left||p.x>r.right||p.y<r.top||p.y>r.bottom)){active.opening=false;popup.dataset.opening='false';}
  if(!inside(e)){hide();over(e);}
 }
 function endPointer(e,cancel=false){
  if(!active?.dragging)return;const initial=!!active.pendingOpening;
  if(!cancel&&!initial)applyPointer(e);
  release(e,cancel);if(!cancel&&active.changed)commit(e);if(initial){active.pendingOpening=null;hide('editing');}
 }
 function sourcePointerStart(e){
  if(e.hoverSlider||e.numericIncrement||!active?.opening||sourceOf(e)!==active.input||e.button>0||e.isPrimary===false||active.input.disabled||active.input.readOnly)return;
  // Keep the real input's native focus/caret behavior and its one pointer
  // owner. A deliberate movement is still required before writing a value.
  const rect=active.input.getBoundingClientRect();active.anchorOffset=e.clientX-rect.left;active.thumbOffset=null;position();railDisplay(parts,range,active.window);
  const thumb=parts.thumb.getBoundingClientRect();active.pointerOffset=e.clientX-(thumb.left+thumb.width/2);active.nativeStart=true;active.changed=false;active.dragging=true;active.pointer=e.pointerId;active.pendingOpening={x:e.clientX,y:e.clientY};active.gate.begin();active.input.dataset.hoverSliderActive='true';Object.defineProperty(e,'hoverSlider',{value:true});
 }
 function nudge(direction,e){
  if(textEditing&&!finishValueEdit(true,e))return false;if(!active||range.disabled)return false;const input=active.input,d=active.window,before=input.value;
  if(d.automaticActive){if(direction<0)return false;input.value=String(d.automatic.boundary);active.window={...d,value:d.automatic.boundary,empty:false,automaticActive:false};display();forward('input',e);return input.value!==before;}
  const increment=numericEditingIncrement(input);if(d.automatic&&direction<0&&increment!==null&&Number(input.value)-increment<d.automatic.boundary)return false;
  const key=direction>0?'ArrowUp':'ArrowDown',keyEvent={key,code:key,repeat:e?.repeat??false},handled=forward('keydown',keyEvent);
  if(!handled?.defaultPrevented){
   try{input.stepUp(direction);}catch{return false;}
   if(d.automatic&&Number(input.value)<d.automatic.boundary){input.value=before;return false;}
   if(input.value!==before)forward('input',e);
  }
  refresh();return input.value!==before;
 }
 function repeatNudge(){nudgeTimer=null;if(!active?.nudgeHeld||range.disabled)return;const owner=active.nudgeHeld;owner.changed=nudge(owner.direction,{repeat:true})||owner.changed;nudgeTimer=delay(repeatNudge,70);}
 function endNudge(e,cancel=false){
  if(!active?.nudgeHeld||e?.pointerId!==undefined&&e.pointerId!==active.nudgeHeld.pointer)return;const owner=active.nudgeHeld;if(nudgeTimer!==null)cancelDelay(nudgeTimer);nudgeTimer=null;active.nudgeHeld=null;
  forward('keyup',{key:owner.direction>0?'ArrowUp':'ArrowDown'});forward(cancel?'pointercancel':'pointerup',e??{pointerId:owner.pointer});active.input.removeAttribute('data-hover-slider-active');if(!cancel&&owner.changed)forward('change',e);
 }
 function extend(direction){if(!active||range.disabled)return;active.opening=false;popup.dataset.opening='false';const d=active.window,span=(d.high-d.low)*9,step=d.step==='any'?0:d.step,align=(v,fn)=>step?rounded(d.base+Math[fn]((v-d.base)/step)*step):rounded(v);if(direction<0&&d.extendLow)d.low=Math.max(d.min??-Infinity,align(Math.min(d.low*10,d.low-span),'floor'));if(direction>0&&d.extendHigh)d.high=Math.min(d.max??Infinity,align(Math.max(d.high*10,d.high+span),'ceil'));d.extendLow=d.min===null||d.low>d.min;d.extendHigh=d.max===null||d.high<d.max;display();}
 function applyPointer(e){if(!active||!Number.isFinite(e.clientX))return;const rect=range.getBoundingClientRect();if(rect.width<=0)return;const d=active.window,x=e.clientX-(active.pointerOffset??0),minimum=rect.left+7,ratio=Math.max(0,Math.min(1,(x-minimum)/Math.max(1,rect.width-14)));
  if(d.automatic&&x<=minimum){if(d.automaticActive)return;if(active.gate.move(x,minimum))return;}else active.gate.move(x,minimum);
  range.value=String(sliderValue(d,ratio));range.dispatchEvent(event('input',e));
 }
 function commit(e){if(!active)return;forward('change',e);const d=active.window,v=finite(range.value);if(v===d.low&&d.extendLow)extend(-1);else if(v===d.high&&d.extendHigh)extend(1);}
 // Native range decoration owns presentation only; the existing input remains
 // the sole value/gesture owner. Roots are registered explicitly, never polled.
 const rangeRoots=new Map(),rangeControls=new Map(),rangeOutputs=new WeakMap(),rangeScope={fr,beginValueEdit,finishValueEdit,hide,editing:()=>textEditing};
 const displayScale=input=>{const n=finite(input.getAttribute('data-hover-slider-display-scale'));return n!==null&&n>0?n:1;};
 function nativeRangeParts(input){
  const presentation=inlineRangePresentations.get(input),label=input.closest?.('label'),scope=input.getRootNode?.()??doc;
  if(presentation?.preparing||input.hidden&&!presentation||input.classList.contains('hover-slider-range'))return null;
  const number=[...(label?.querySelectorAll('input[type="number"]')??[])].find(n=>!n.hidden);
  // A visible native numeric editor already supplies its value and spin buttons.
  if(number)return null;
  const output=[...(label?.querySelectorAll('output')??[])].find(o=>!o.hidden&&!o.closest?.('[data-hover-slider-popup]'))??[...(scope.querySelectorAll?.('output[for]')??[])].find(o=>!o.hidden&&(o.getAttribute('for')??'').split(/\s+/).includes(input.id));
  return{presentation,output};
 }
 function bindNativeRange(input,parts,shared){
  const wrapper=parts.presentation?.wrapper??doc.createElement('span'),external=!!parts.presentation,rail=parts.presentation?.rail??input,output=parts.output??doc.createElement('output'),created=!parts.output,slot=created?null:doc.createComment('native-range-value'),nudges=doc.createElement('span'),up=doc.createElement('button'),down=doc.createElement('button'),off=[];
  let held=null,timer=null,closed=false;const ownerScope=()=>shared.scopes.values().next().value??shared.lastScope;
  const outputAttributes=Object.fromEntries(['tabindex','role','aria-keyshortcuts','aria-description'].map(k=>[k,output.getAttribute(k)]));
  if(!external){input.before(wrapper);wrapper.append(input);}wrapper.classList.add('native-range-controls');nudges.className='native-range-nudges';up.type=down.type='button';up.textContent='▴';down.textContent='▾';up.dataset.nativeRangeNudge='1';down.dataset.nativeRangeNudge='-1';nudges.append(up,down);
  if(slot)output.before(slot);wrapper.append(nudges,output);output.classList.add('native-range-value');output.tabIndex=0;output.setAttribute('role','button');output.setAttribute('aria-keyshortcuts','Enter F2');rangeOutputs.set(output,input);
  const listenInline=(target,type,fn,options)=>{target?.addEventListener?.(type,fn,options);off.push(()=>target?.removeEventListener?.(type,fn,options));},allowed=()=>!closed&&input.isConnected!==false&&!input.disabled&&!input.readOnly&&(!input.hidden||!!inlineRangePresentations.get(input));
  const dispatch=(type,source)=>{const e=event(type,source);input.dispatchEvent(e);return e;},setAttribute=(node,key,value)=>{if(node.getAttribute(key)!==value)node.setAttribute(key,value);};
  function sync(){if(closed)return;const disabled=!allowed();if(up.disabled!==disabled)up.disabled=disabled;if(down.disabled!==disabled)down.disabled=disabled;setAttribute(up,'aria-label',ownerScope().fr()?'Augmenter la valeur':'Increase value');setAttribute(down,'aria-label',ownerScope().fr()?'Diminuer la valeur':'Decrease value');setAttribute(output,'aria-description',ownerScope().fr()?'Double-cliquez pour saisir une valeur.':'Double-click to enter a value.');if(created&&ownerScope().editing()?.output!==output){const scale=displayScale(input),value=scale===1?input.value:String(rounded(Number(input.value)*scale));if(output.textContent!==value)output.textContent=value;}if(disabled&&held)end(undefined,true);}
  function nudge(direction,source){
   if(!allowed())return false;const before=input.value,presentation=inlineRangePresentations.get(input),d=presentation?.describe(),increment=numericEditingIncrement(input),key=direction>0?'ArrowUp':'ArrowDown';
   if(d?.automaticActive){if(direction<0)return false;input.value=String(d.automatic.boundary);dispatch('input',source);sync();return input.value!==before;}
   const e=dispatch('keydown',{key,code:key,repeat:source?.repeat??false});
   if(!e.defaultPrevented){
    if(input.step==='any'){
     // UI editing effort only; native step=any keeps every valid precision.
     const lo=attribute(input,'min')??0,hi=attribute(input,'max')??100,step=increment??(hi-lo)/1000;
     const raw=Number(input.value)+direction*step;if(!(Number.isFinite(lo)&&Number.isFinite(hi)&&hi>lo&&Number.isFinite(step)&&step>0&&Number.isFinite(raw)))return false;input.value=String(Math.max(lo,Math.min(hi,rounded(raw))));
    }else try{input.stepUp(direction);}catch{return false;}
    if(d?.automatic&&Number(input.value)<d.automatic.boundary){input.value=before;return false;}
    if(input.value!==before)dispatch('input',source);
   }
   sync();return input.value!==before;
  }
  function clearTimer(){if(timer!==null)cancelDelay(timer);timer=null;}
  function end(e,cancel=false){if(e?.hoverSlider||!held||e?.pointerId!==undefined&&e.pointerId!==held.pointerId)return;const owner=held;held=null;clearTimer();dispatch('keyup',{key:owner.direction>0?'ArrowUp':'ArrowDown'});dispatch(cancel?'pointercancel':'pointerup',e??owner);input.removeAttribute('data-hover-slider-active');if(!cancel&&owner.changed)dispatch('change',e);}
  function repeat(){timer=null;if(!held)return;if(!allowed()){end(undefined,true);return;}held.changed=nudge(held.direction,{repeat:true})||held.changed;timer=delay(repeat,70);}
  for(const[button,direction]of[[up,1],[down,-1]]){
   listenInline(button,'pointerdown',e=>{if(e.button>0||e.isPrimary===false||!allowed()||ownerScope().editing()&&!ownerScope().finishValueEdit(true,e))return;e.preventDefault();end(undefined,true);ownerScope().hide('editing');input.dataset.hoverSliderActive='true';focusSlider(input);held={direction,pointerId:e.pointerId,clientX:e.clientX,clientY:e.clientY,changed:false};dispatch('pointerdown',e);held.changed=nudge(direction,e);timer=delay(repeat,350);});
   listenInline(button,'click',e=>{e.preventDefault();if(e.detail!==0||!allowed()||ownerScope().editing()&&!ownerScope().finishValueEdit(true,e))return;const changed=nudge(direction,e);dispatch('keyup',{key:direction>0?'ArrowUp':'ArrowDown'});if(changed)dispatch('change',e);});
  }
  listenInline(doc,'pointerup',e=>end(e),true);listenInline(doc,'pointercancel',e=>end(e,true),true);listenInline(win,'blur',()=>end(undefined,true));listenInline(input,'blur',()=>end(undefined,true));listenInline(input,'input',sync);listenInline(input,'change',sync);
  listenInline(output,'keydown',e=>{if(['Enter','F2',' '].includes(e.key)){e.preventDefault();e.stopPropagation();ownerScope().beginValueEdit(input,output,e);}});
  sync();return{input,output,wrapper,rail,presentation:parts.presentation,sync,dispose(){if(closed)return;end(undefined,true);if(ownerScope().editing()?.output===output)ownerScope().finishValueEdit(false);closed=true;clearTimer();for(const stop of off.splice(0))stop();rangeOutputs.delete(output);nudges.remove();output.classList.remove('native-range-value');for(const[key,value]of Object.entries(outputAttributes))if(value===null)output.removeAttribute(key);else output.setAttribute(key,value);if(created)output.remove();else if(slot?.parentNode){slot.before(output);slot.remove();}wrapper.classList.remove('native-range-controls');if(!external){if(wrapper.parentNode)wrapper.before(input);wrapper.remove();}}};
 }
 function acquireNativeRange(input,parts){
  let shared=inlineRangeOwners.get(input);
  if(!shared){shared={scopes:new Set(),lastScope:rangeScope,control:null};inlineRangeOwners.set(input,shared);shared.scopes.add(rangeScope);try{shared.control=bindNativeRange(input,parts,shared);inlineRangeOutputOwners.set(shared.control.output,shared);}catch(error){inlineRangeOwners.delete(input);throw error;}}
  else shared.scopes.add(rangeScope);
  shared.lastScope=rangeScope;const control=shared.control;rangeOutputs.set(control.output,input);let released=false;
  return{presentation:control.presentation,sync:()=>control.sync(),dispose(){if(released)return;released=true;if(rangeScope.editing()?.output===control.output)rangeScope.finishValueEdit(false);rangeOutputs.delete(control.output);shared.scopes.delete(rangeScope);shared.lastScope=shared.scopes.values().next().value??rangeScope;if(!shared.scopes.size){control.dispose();inlineRangeOutputOwners.delete(control.output);inlineRangeOwners.delete(input);shared.lastScope=null;}else control.sync();}};
 }
 function syncRangeRoot(record){
  if(record.syncing||disposed||rangeRoots.get(record.root)!==record)return;record.syncing=true;
  try{
   const present=new Set();for(const input of record.root.querySelectorAll?.('input[type="range"]')??[]){if(input.getRootNode?.()!==record.root)continue;const parts=nativeRangeParts(input),old=rangeControls.get(input);if(!parts){if(old){old.dispose();rangeControls.delete(input);}continue;}present.add(input);if(old&&old.presentation!==parts.presentation){old.dispose();rangeControls.delete(input);}let control=rangeControls.get(input);if(!control){control=acquireNativeRange(input,parts);rangeControls.set(input,control);}control.sync();}
   for(const[input,control]of rangeControls)if(control.root===record.root&&!present.has(input)){control.dispose();rangeControls.delete(input);}
   for(const input of present){const control=rangeControls.get(input);if(control)control.root=record.root;}
  }finally{record.syncing=false;}
 }
 function releaseRangeRoot(record){if(rangeRoots.get(record.root)!==record)return;rangeRoots.delete(record.root);record.observer?.disconnect();for(const[input,control]of rangeControls)if(control.root===record.root){control.dispose();rangeControls.delete(input);}record.releaseStyle?.();}
 function registerRoot(registered){
  if(disposed||!registered?.querySelectorAll)return()=>{};let record=rangeRoots.get(registered);
  if(!record){record={root:registered,refs:0,syncing:false};rangeRoots.set(registered,record);if(registered.host){let style=inlineRangeStyles.get(registered);if(!style){const link=doc.createElement('link');link.rel='stylesheet';link.href=new URL('./hover-sliders.css',import.meta.url).href;link.dataset.nativeRangeStyle='';registered.append(link);style={link,refs:0};inlineRangeStyles.set(registered,style);}style.refs++;record.releaseStyle=()=>{if(--style.refs===0){style.link.remove();inlineRangeStyles.delete(registered);}};}
   if(win?.MutationObserver){record.observer=new win.MutationObserver(()=>syncRangeRoot(record));record.observer.observe(registered,{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:['disabled','readonly','hidden','min','max','step','value','aria-label','data-hover-slider-display-scale']});}syncRangeRoot(record);
  }record.refs++;let ended=false;return()=>{if(ended)return;ended=true;if(--record.refs===0)releaseRangeRoot(record);};
 }
 function unregisterRoot(registered){const record=rangeRoots.get(registered);if(record&&--record.refs<=0)releaseRangeRoot(record);}
 listen(root,'hover-slider-presentation',e=>{const input=(e.composedPath?.()??[e.target]).find(n=>n?.tagName==='INPUT'),record=rangeRoots.get(input?.getRootNode?.());if(record)syncRangeRoot(record);},true);
 listen(root,'pointerdown',e=>{const output=valueOutput(e);if(output&&valueControl(output))e.preventDefault();},true);
 listen(root,'click',e=>{const output=valueOutput(e);if(output&&valueControl(output))e.preventDefault();},true);
 listen(root,'dblclick',e=>{if(e.hoverSlider)return;const output=valueOutput(e),input=valueControl(output);if(!input)return;e.preventDefault();e.stopPropagation();beginValueEdit(input,output,e);},true);
 listen(currentText,'keydown',e=>{if(['Enter','F2',' '].includes(e.key)){e.preventDefault();e.stopPropagation();beginValueEdit(active?.input,currentText,e);}});
 listen(doc,'pointerdown',e=>{if(textEditing&&!e.composedPath?.().includes(textEditing.editor)&&!e.composedPath?.().includes(textEditing.output)&&!finishValueEdit(true,e)){e.preventDefault();e.stopImmediatePropagation();}},true);
 listen(root,'pointerover',over,true);listen(root,'pointerdown',sourcePointerStart,true);listen(doc,'pointermove',move,true);
 listen(doc,'pointerup',e=>{if(e.hoverSlider)return;if(active?.nudgeHeld)endNudge(e);else if(active?.dragging&&(active.pointer===undefined||e.pointerId===undefined||active.pointer===e.pointerId))endPointer(e);},true);
 listen(doc,'pointercancel',e=>{if(e.hoverSlider)return;if(active?.nudgeHeld)endNudge(e,true);else if(active?.dragging&&(active.pointer===undefined||e.pointerId===undefined||active.pointer===e.pointerId))endPointer(e,true);},true);
 listen(root,'input',e=>{if(!e.hoverSlider&&active&&sourceOf(e)===active.input)refresh();},true);listen(root,'change',e=>{if(!e.hoverSlider&&active&&sourceOf(e)===active.input)refresh();},true);
 listen(rail,'pointerdown',e=>{if(!active||range.disabled||e.button>0||e.isPrimary===false)return;e.preventDefault();active.opening=false;popup.dataset.opening='false';active.nativeStart=false;active.pendingOpening=null;active.pointerOffset=0;active.changed=false;active.dragging=true;active.pointer=e.pointerId;active.gate.begin();active.input.dataset.hoverSliderActive='true';focusSlider(range);forward('pointerdown',e);applyPointer(e);});listen(range,'click',e=>e.preventDefault());
 listen(range,'input',e=>{if(!active)return;const changed=active.input.value!==range.value;active.input.value=range.value;active.window.value=Number(range.value);active.window.empty=false;active.window.automaticActive=false;valueLabel();if(changed){active.changed=true;forward('input',e);}});listen(range,'change',commit);listen(range,'keydown',e=>{if(e.key==='Escape'){hide('escape');return;}forward('keydown',e);if(active&&!e.defaultPrevented)applyBoundaryKey(active.input,e);});listen(range,'keyup',e=>forward('keyup',e));listen(range,'blur',e=>forward('blur',e));

 for(const[button,direction]of[[nudgeUp,1],[nudgeDown,-1]]){
  listen(button,'pointerdown',e=>{if(!active||button.disabled||e.button>0||e.isPrimary===false)return;e.preventDefault();active.opening=false;popup.dataset.opening='false';focusSlider(range);active.input.dataset.hoverSliderActive='true';forward('pointerdown',e);active.nudgeHeld={direction,pointer:e.pointerId,changed:nudge(direction,e)};nudgeTimer=delay(repeatNudge,350);});
  listen(button,'click',e=>{e.preventDefault();if(e.detail!==0||!active||button.disabled)return;const changed=nudge(direction,e);forward('keyup',{key:direction>0?'ArrowUp':'ArrowDown'});if(changed)forward('change',e);});
 }
 listen(rail,'dblclick',e=>{if(!e.hoverSlider){e.preventDefault();forward('dblclick',e);refresh();}});listen(lower,'click',()=>extend(-1));listen(upper,'click',()=>extend(1));listen(doc,'keydown',e=>{if(e.key==='Escape'&&textEditing){e.preventDefault();e.stopImmediatePropagation();const input=textEditing.input;finishValueEdit(false,e);focusSlider(input);}else if(e.key==='Escape'&&active)hide('escape');},true);listen(doc,'pointerdown',e=>{if(active&&!e.hoverSlider&&!active.dragging&&!inside(e)&&!e.composedPath?.().includes(popup))hide();},true);
 listen(root,'keydown',e=>{if(!live||disposed||e.hoverSlider)return;const input=sourceOf(e);if(input&&eligible(input))applyBoundaryKey(input,e);});
 listen(win,'resize',position);listen(win?.visualViewport,'resize',position);listen(win?.visualViewport,'scroll',position);listen(doc,'scroll',position,true);listen(win,'blur',e=>{if(e.target===win)hide();});
 registerRoot(root);
 return{registerRoot,unregisterRoot,setEnabled(value){live=!!value;if(!live){hide();dismissed=null;}},setLanguage(value){langOverride=value;display();for(const control of rangeControls.values())control.sync();},refresh(){refresh();for(const record of rangeRoots.values())syncRangeRoot(record);},hide,get enabled(){return live;},get active(){return active?{input:active.input,popup,range,window:{...active.window},dragging:active.dragging}:null;},dispose(){if(disposed)return;finishValueEdit(false);hide();dismissed=null;for(const record of [...rangeRoots.values()])releaseRangeRoot(record);disposed=true;for(const off of listeners.splice(0))off();popup.remove();}};
}

/** Decorate an explicitly admitted existing range without adding a popup.
 * The original native control keeps its value, constraints and event handlers.
 * A presentation range excludes a numeric Auto sentinel from the manual track. */
export function bindAutomaticRange(original,{automatic,resolveRange=()=>null,language=()=> 'fr',now=()=>performance.now(),delay=(fn,ms)=>setTimeout(fn,ms),cancelDelay=clearTimeout}={}){
 const doc=original?.ownerDocument,win=doc?.defaultView;if(original?.tagName!=='INPUT'||original.type!=='range'||!doc||!original.parentNode)throw new TypeError('A connected native range is required.');
 const describe=previous=>numericSliderWindow(original,{...(resolveRange({input:original,value:finite(original.value),min:attribute(original,'min'),max:attribute(original,'max'),step:original.getAttribute('step')??'1'})??{}),...(automatic?{automatic}:{})},previous);
 let window=describe();if(!window?.automatic)return null;if(window.automatic.value===null)throw new TypeError('A native range cannot serialize nullable Auto. Use a nullable number field.');
 inlineRangePresentations.set(original,{preparing:true});original.dispatchEvent(new(win?.Event??Event)('hover-slider-presentation',{bubbles:true,composed:true}));inlineRangePresentations.delete(original);
 const range=doc.createElement('input');range.type='range';range.className='hover-slider-range';for(const key of ['aria-label','aria-labelledby','aria-describedby','title'])if(original.hasAttribute(key))range.setAttribute(key,original.getAttribute(key));range.setAttribute('aria-keyshortcuts','Alt+ArrowLeft');
 const parts=sliderRail(doc,range),{rail}=parts,wrapper=doc.createElement('div');wrapper.className='hover-slider-inline';const oldHidden=original.hidden,hadClass=original.classList.contains('hover-slider-original'),listeners=[];let dragging=false,pointer=null,disposed=false,observer;
 const listen=(target,type,fn,options)=>{target?.addEventListener?.(type,fn,options);listeners.push(()=>target?.removeEventListener?.(type,fn,options));},fr=()=>((typeof language==='function'?language():language)!=='en');
 const event=(type,e)=>{const C=type.startsWith('pointer')?win?.PointerEvent:type.startsWith('key')?win?.KeyboardEvent:type==='dblclick'?win?.MouseEvent:win?.Event,props={bubbles:type!=='blur',composed:true,cancelable:true,button:e?.button??0,buttons:e?.buttons??0,pointerId:e?.pointerId??pointer??1,pointerType:e?.pointerType??'mouse',isPrimary:true,clientX:e?.clientX??0,clientY:e?.clientY??0,key:e?.key,code:e?.code,repeat:e?.repeat??false,altKey:e?.altKey??false,ctrlKey:e?.ctrlKey??false,metaKey:e?.metaKey??false,shiftKey:e?.shiftKey??false},answer=new(C??win?.Event??Event)(type,props);for(const[key,value]of Object.entries(props))if(!(key in answer))Object.defineProperty(answer,key,{value});Object.defineProperty(answer,'hoverSlider',{value:true});return answer;},forward=(type,e)=>{const forwarded=event(type,e);original.dispatchEvent(forwarded);if(forwarded.defaultPrevented)e?.preventDefault?.();return forwarded;};
 function display(){if(disposed)return;range.disabled=original.disabled||original.readOnly;railDisplay(parts,range,window);if(window.automaticActive)range.setAttribute('aria-valuetext',fr()?'Automatique':'Automatic');else range.removeAttribute('aria-valuetext');parts.zone.title=fr()?'Minimum, puis32px à gauche et maintien180ms. Alt+← : Auto.':'Minimum, then32px left and180ms contact. Alt+←: Auto.';}
 function refresh(){if(disposed)return;const next=describe(window);if(!next?.automatic){range.disabled=true;gate.end();return;}window=next;if(original.disabled||original.readOnly)gate.end();display();}
 function write(value,e){if(disposed)return;const serialized=String(value),changed=original.value!==serialized;original.value=serialized;window={...window,value:value===window.automatic.value?window.low:value,empty:false,automaticActive:value===window.automatic.value};display();if(changed)forward('input',e);}
 const gate=createAutomaticSliderGate({now,delay,cancelDelay,onAutomatic:()=>{if(!range.disabled)write(window.automatic.value);}});
 function apply(e){if(disposed||!Number.isFinite(e.clientX))return;const r=range.getBoundingClientRect(),minimum=r.left+7;if(r.width<=0)return;if(e.clientX<=minimum){if(window.automaticActive)return;if(gate.move(e.clientX,minimum))return;}else gate.move(e.clientX,minimum);write(sliderValue(window,Math.max(0,Math.min(1,(e.clientX-minimum)/Math.max(1,r.width-14)))),e);}
 function end(e,cancel=false,sampleFinal=true){if(e.hoverSlider||!dragging||pointer!==undefined&&e.pointerId!==undefined&&pointer!==e.pointerId)return;if(!cancel&&sampleFinal)apply(e);forward(cancel?'pointercancel':'pointerup',e);dragging=false;pointer=null;gate.end();original.removeAttribute('data-hover-slider-active');if(!cancel)forward('change',e);}
 // Complete admission before masking the original. Disposal restores its DOM
 // place and visibility; the native min/max/step/ARIA never change.
 original.parentNode.insertBefore(wrapper,original);wrapper.append(original,rail);original.classList.add('hover-slider-original');original.hidden=true;inlineRangePresentations.set(original,{rail,wrapper,describe:()=>window});display();original.dispatchEvent(new(win?.Event??Event)('hover-slider-presentation',{bubbles:true,composed:true}));
 listen(rail,'pointerdown',e=>{if(range.disabled||e.button>0||e.isPrimary===false)return;e.preventDefault();dragging=true;pointer=e.pointerId;gate.begin();original.dataset.hoverSliderActive='true';focusSlider(range);forward('pointerdown',e);apply(e);});
 const controlRoot=win??doc;listen(controlRoot,'pointermove',e=>{if(!e.hoverSlider&&dragging&&(pointer===undefined||e.pointerId===undefined||pointer===e.pointerId)){if(e.buttons===0){end(e,false,false);return;}forward('pointermove',e);apply(e);}},true);listen(controlRoot,'pointerup',e=>end(e),true);listen(controlRoot,'pointercancel',e=>end(e,true),true);
 listen(range,'input',e=>write(Number(range.value),e));listen(range,'change',e=>forward('change',e));listen(range,'click',e=>e.preventDefault());listen(rail,'dblclick',e=>{if(!e.hoverSlider){e.preventDefault();forward('dblclick',e);refresh();}});
 listen(range,'keydown',e=>{forward('keydown',e);if(e.defaultPrevented)return;const value=finite(original.value),answer=keyboardAutomatic(value,e,window);if(automaticShortcut(e,window))e.preventDefault();if(answer!==undefined){e.preventDefault();write(answer,e);if(e.altKey&&e.key==='ArrowLeft')forward('change',e);}});listen(range,'keyup',e=>forward('keyup',e));listen(range,'blur',e=>forward('blur',e));listen(original,'input',refresh);listen(original,'change',refresh);listen(win,'resize',display);listen(win,'blur',e=>{if(dragging)end(e,true);});
 if(win?.MutationObserver){observer=new win.MutationObserver(refresh);observer.observe(original,{attributes:true,attributeFilter:['min','max','step','value','disabled','readonly','data-hover-slider-automatic']});}
 return{original,range,rail,refresh,get state(){return{dragging,automatic:window.automaticActive,window:{...window},gate:gate.state};},dispose(){if(disposed)return;if(dragging)end({});gate.end();disposed=true;observer?.disconnect();for(const off of listeners.splice(0))off();if(wrapper.parentNode)wrapper.parentNode.insertBefore(original,wrapper);original.hidden=oldHidden;if(!hadClass)original.classList.remove('hover-slider-original');inlineRangePresentations.delete(original);wrapper.remove();original.dispatchEvent(new(win?.Event??Event)('hover-slider-presentation',{bubbles:true,composed:true}));}};
}
