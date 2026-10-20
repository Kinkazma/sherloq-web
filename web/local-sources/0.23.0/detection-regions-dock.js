const labels={fr:{title:'Zones / Biomes',show:'Afficher',hide:'Masquer'},en:{title:'Regions / Biomes',show:'Show',hide:'Hide'}};
let sequence=0;
const invalid=message=>Object.assign(new TypeError(message),{code:'DETECTION_REGIONS_DOCK_INVALID'});

/** Shared sidebar host only. Moving or folding a panel never rebuilds its
 * controls, changes its history or calls its detection/analysis controller. */
export function createDetectionRegionsDock({document=globalThis.document,parent,before=null,language='fr'}={}){
 if(!document?.createElement||!parent?.insertBefore||before&&before.parentNode!==parent)throw invalid('A document and a valid sidebar insertion point are required.');
 const node=(tag,className)=>{const el=document.createElement(tag);el.className=className;return el;};
 const element=node('section','detection-regions-dock'),toggle=node('button','detection-regions-dock-toggle'),title=node('span','detection-regions-dock-title'),action=node('span','detection-regions-dock-action'),body=node('div','detection-regions-dock-body');
 do{body.id='sherloq-detection-regions-dock-body-'+(++sequence);}while(document.getElementById?.(body.id));
 toggle.type='button';toggle.setAttribute('aria-controls',body.id);toggle.append(title,document.createTextNode(' · '),action);element.append(toggle,body);element.hidden=true;parent.insertBefore(element,before);
 const records=new WeakMap();let current=null,collapsed=false,disposed=false,observer=null;
 const activeElement=()=>{let active=document.activeElement;while(active?.shadowRoot?.activeElement)active=active.shadowRoot.activeElement;return active;};
 const focusedWithin=el=>{const active=activeElement();return active&&el.contains(active)?active:null;};
 const focus=el=>{if(el?.isConnected&&activeElement()!==el)el.focus?.({preventScroll:true});};
 const setHidden=(el,value)=>{if(el.hidden!==value)el.hidden=value;};
 const attribute=(el,name,value)=>{if(el.getAttribute(name)!==value)el.setAttribute(name,value);};
 function refresh(){
  if(disposed)return;
  const visible=!!current&&!current.node.hidden,t=labels[(typeof language==='function'?language():language)==='en'?'en':'fr'];
  setHidden(element,!visible);setHidden(body,collapsed);element.classList.toggle('collapsed',collapsed);element.dataset.collapsed=String(collapsed);
  attribute(toggle,'aria-expanded',String(!collapsed));attribute(toggle,'aria-label',(collapsed?t.show:t.hide)+' '+t.title);attribute(element,'aria-label',t.title);
  if(title.textContent!==t.title)title.textContent=t.title;const nextAction=collapsed?t.show:t.hide;if(action.textContent!==nextAction)action.textContent=nextAction;toggle.title=toggle.getAttribute('aria-label');
 }
 function detach(){
  observer?.disconnect();observer=null;if(!current)return;
  const record=current,focused=focusedWithin(record.node);if(focused)record.focused=focused;
  if(record.placeholder?.parentNode){record.placeholder.parentNode.replaceChild(record.node,record.placeholder);record.placeholder=null;}
  else record.node.remove();
  current=null;
 }
 function attach(next){
  if(disposed)throw invalid('Regions dock disposed.');
  if(next===current?.node){refresh();return next;}
  if(next!==null&&(!next||next.nodeType!==1||typeof next.contains!=='function'||next===element||next.contains(element)||element.contains(next)))throw invalid('Attach an independent region panel element or null.');
  const incomingFocus=next?focusedWithin(next):null,previousFocus=current?focusedWithin(current.node):null,fromToggle=activeElement()===toggle;detach();
  if(next){
   current=records.get(next)??{node:next,focused:null,placeholder:null};records.set(next,current);
   if(next.parentNode){current.placeholder=document.createComment('SHERLOQ regions dock position');next.parentNode.insertBefore(current.placeholder,next);}
   body.append(next);
   const Observer=document.defaultView?.MutationObserver;
   if(Observer){observer=new Observer(refresh);observer.observe(next,{attributes:true,attributeFilter:['hidden']});}
  }
  refresh();
  if(current&&!collapsed&&!element.hidden)focus(incomingFocus??((previousFocus||fromToggle)?current.focused:null));
  return next;
 }
 function setCollapsed(value){
  if(typeof value!=='boolean')throw invalid('Collapsed state must be boolean.');if(disposed||value===collapsed)return collapsed;
  const focused=current?focusedWithin(current.node):null;
  if(focused)current.focused=focused;
  collapsed=value;if(collapsed&&focused)focus(toggle);refresh();
  if(!collapsed&&!element.hidden&&activeElement()===toggle)focus(current?.focused);
  return collapsed;
 }
 toggle.onclick=()=>setCollapsed(!collapsed);refresh();
 return {element,body,toggle,attach,refresh,translate(nextLanguage){if(nextLanguage!==undefined)language=nextLanguage;refresh();},setCollapsed,get collapsed(){return collapsed;},dispose(){if(disposed)return;detach();disposed=true;toggle.onclick=null;element.remove();}};
}

export const createDock=createDetectionRegionsDock;
