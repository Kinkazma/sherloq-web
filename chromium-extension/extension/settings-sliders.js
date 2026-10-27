import {installHoverSliders} from './panel-sliders.js';

// Numeric owners keep their types, validation and existing handlers. Geometry
// still serializes through its number input, including the zoom's +100 offset.
export function mountSettingsSliders({root=globalThis.document,selector='#geometry input[type="number"],#step-controls input[type="number"],#effects input[type="number"]',language=()=> 'fr'}={}){
 const doc=root.nodeType===9?root:root.ownerDocument,win=doc.defaultView,records=new Map(),rows=new Map(),off=[];let hover,observer,disposed=false,refreshing=false;
 const listen=(target,type,fn,options)=>{target.addEventListener(type,fn,options);off.push(()=>target.removeEventListener(type,fn,options));};
 const attribute=(node,key,value)=>{if(value===null){if(node.hasAttribute(key))node.removeAttribute(key);}else if(node.getAttribute(key)!==value)node.setAttribute(key,value);};
 const event=(type,source)=>{const C=type.startsWith('pointer')?win.PointerEvent:type.startsWith('key')?win.KeyboardEvent:win.Event,value=new C(type,{bubbles:type!=='blur',composed:true,cancelable:true,button:source?.button??0,buttons:source?.buttons??0,pointerId:source?.pointerId??1,pointerType:source?.pointerType??'mouse',isPrimary:true,clientX:source?.clientX??0,clientY:source?.clientY??0,key:source?.key,code:source?.code,repeat:source?.repeat??false,altKey:source?.altKey??false,ctrlKey:source?.ctrlKey??false,metaKey:source?.metaKey??false,shiftKey:source?.shiftKey??false});Object.defineProperty(value,'hoverSlider',{value:true});return value;};
 function markRow(input){const row=input.closest('label');if(row&&!rows.has(row)){rows.set(row,row.getAttribute('data-settings-slider-row'));row.dataset.settingsSliderRow='';}}
 function isEditing(input){
  const record=records.get(input),control=record?.proxy??record?.paired??input,wrapper=control.closest?.('.native-range-controls');
  return doc.activeElement===input||doc.activeElement===control||input.hasAttribute('data-hover-slider-active')||control.hasAttribute('data-hover-slider-active')||!!wrapper?.querySelector('[data-hover-slider-editor]');
 }
 function add(input){
  if(records.has(input)||input.hidden||!input.parentNode)return;const row=input.closest('label'),paired=[...(row?.querySelectorAll('input[type="range"]')??[])].find(control=>!control.classList.contains('hover-slider-range')&&!control.hasAttribute('data-settings-slider-proxy'));
  const record={input,hidden:input.hidden,proxy:null};records.set(input,record);markRow(input);
  if(paired){record.paired=paired;input.hidden=true;return;}
  const minimum=Number(input.min),maximum=Number(input.max);if(input.min===''||input.max===''||!Number.isFinite(minimum)||!Number.isFinite(maximum)||minimum>=maximum){records.delete(input);return;}
  const proxy=doc.createElement('input');proxy.type='range';proxy.dataset.settingsSliderProxy='';record.proxy=proxy;input.before(proxy);input.hidden=true;
  listen(proxy,'input',source=>{input.value=proxy.value;input.dispatchEvent(event('input',source));});listen(proxy,'change',source=>input.dispatchEvent(event('change',source)));
  for(const type of ['pointerdown','pointermove','pointerup','pointercancel','keydown','keyup','blur','dblclick'])listen(proxy,type,source=>{if(type==='pointerdown')input.dataset.hoverSliderActive='true';const forwarded=event(type,source);input.dispatchEvent(forwarded);if(forwarded.defaultPrevented)source.preventDefault();if(type==='pointerup'||type==='pointercancel'||type==='blur')input.removeAttribute('data-hover-slider-active');});
 }
 function refresh(){
  if(disposed||refreshing)return;refreshing=true;
  try{for(const input of root.querySelectorAll(selector))add(input);for(const [input,record]of records){const proxy=record.proxy;if(!proxy)continue;for(const key of ['min','max','step'])attribute(proxy,key,input.getAttribute(key));const label=input.getAttribute('aria-label')??input.closest('label')?.querySelector('span')?.textContent?.trim()??'';attribute(proxy,'aria-label',label);if(proxy.disabled!==input.disabled)proxy.disabled=input.disabled;if(proxy.readOnly!==input.readOnly)proxy.readOnly=input.readOnly;if(!isEditing(input)&&input.value!==''&&proxy.value!==input.value)proxy.value=input.value;}hover?.refresh();}finally{refreshing=false;}
 }
 refresh();hover=installHoverSliders({root,enabled:true,language,resolveRange:()=>({navigation:'full'})});
 // SHERLOQ's maintained editor is opened by F2/Enter. A simple click on its
 // value uses that same editor, without introducing another value control.
 listen(root,'click',source=>{const output=(source.composedPath?.()??[source.target]).find(node=>node?.tagName==='OUTPUT'&&node.classList.contains('native-range-value'));if(!output||source.detail>1)return;source.preventDefault();output.dispatchEvent(new win.KeyboardEvent('keydown',{key:'F2',code:'F2',bubbles:true,cancelable:true}));},true);
 const release=()=>{for(const record of records.values())if(record.proxy)record.input.removeAttribute('data-hover-slider-active');};listen(doc,'pointerup',release);listen(doc,'pointercancel',release);listen(win,'blur',release);
 if(win.MutationObserver){observer=new win.MutationObserver(refresh);observer.observe(root,{subtree:true,childList:true});}
 refresh();return{refresh,isEditing,hide:()=>hover.hide(),dispose(){if(disposed)return;disposed=true;observer?.disconnect();hover.dispose();for(const stop of off.splice(0))stop();for(const [input,record]of records){record.proxy?.remove();input.hidden=record.hidden;input.removeAttribute('data-hover-slider-active');}for(const [row,prior]of rows)attribute(row,'data-settings-slider-row',prior);records.clear();rows.clear();}};
}
