const strings={fr:{zones:'Zones',biomes:'Biomes',acquisition:'Acquisition',exclusion:'Exclusion',biome:'Biome',addAcquisition:'Ajouter une acquisition',addExclusion:'Ajouter une exclusion',modify:'Modifier les zones',undo:'Annuler',redo:'Rétablir',empty:'Aucune zone définie.',edit:'Modifier',native:'Groupe apparié natif'},en:{zones:'Regions',biomes:'Biomes',acquisition:'Acquisition',exclusion:'Exclusion',biome:'Biome',addAcquisition:'Add acquisition',addExclusion:'Add exclusion',modify:'Edit regions',undo:'Undo',redo:'Redo',empty:'No regions defined.',edit:'Edit',native:'Native paired group'}};
const invalid=message=>Object.assign(new TypeError(message),{code:'DETECTION_REGIONS_INVALID'});
const finitePolygon=polygon=>Array.isArray(polygon)&&polygon.length>0&&polygon.every(p=>Array.isArray(p)&&p.length===2&&p.every(Number.isFinite));
function validateGroups(groups){
 if(!Array.isArray(groups))throw invalid('Native biome groups must be an array.');const ids=new Set();
 return groups.map(group=>{
  if(!group||typeof group.id!=='string'||!group.id||ids.has(group.id)||!Array.isArray(group.polygons)||group.polygons.length!==2||!group.polygons.every(finitePolygon)||!Array.isArray(group.color)||group.color.length!==3||!group.color.every(c=>Number.isInteger(c)&&c>=0&&c<=255))throw invalid('Each biome needs two native sides, a unique ID and its RGB color.');
  if(group.polygons.some(p=>p.length<3)&&!(group.nativeGeometry===true&&Number.isSafeInteger(group.nativeGroupIndex)&&group.nativeGroupIndex>=0))throw invalid('Degenerate sides require explicit native group provenance.');
  ids.add(group.id);return structuredClone(group);
 });
}

/** Presentation-only sidebar. The owner provides native paired geometry and
 * handles edits/highlights. This component never runs or changes an analysis. */
export function createDetectionRegionsPanel({document=globalThis.document,parent,language='fr',onHighlight=()=>{},onEdit=()=>{},onAddAcquisition=()=>{},onAddExclusion=()=>{},onModify=()=>{},onUndo=()=>{},onRedo=()=>{},onModeChange=()=>{}}={}){
 if(!document)throw invalid('A document is required.');const currentStrings=()=>strings[(typeof language==='function'?language():language)==='en'?'en':'fr'];let t=currentStrings();
 const node=(tag,className,text)=>{const el=document.createElement(tag);if(className)el.className=className;if(text!==undefined)el.textContent=text;return el;};
 const element=node('section','detection-regions-panel'),tabs=node('div','detection-regions-tabs'),actions=node('div','detection-regions-actions'),list=node('div','detection-regions-list'),empty=node('p','detection-regions-empty',t.empty);tabs.setAttribute('role','tablist');tabs.setAttribute('aria-label',t.zones+' / '+t.biomes);
 const button=(label,action,callback)=>{const el=node('button','',label);el.type='button';el.dataset.detectionAction=action;el.onclick=callback;return el;};
 const zonesTab=button(t.zones,'zones',()=>setMode('zones')),biomesTab=button(t.biomes,'biomes',()=>setMode('biomes'));for(const tab of [zonesTab,biomesTab]){tab.setAttribute('role','tab');tab.setAttribute('aria-selected','false');}
 const addAcquisition=button(t.addAcquisition,'add-acquisition',onAddAcquisition),addExclusion=button(t.addExclusion,'add-exclusion',onAddExclusion),modify=button(t.modify,'modify',onModify),history=node('div','detection-regions-history'),undo=button(t.undo,'undo',onUndo),redo=button(t.redo,'redo',onRedo);
 tabs.append(zonesTab,biomesTab);actions.append(addAcquisition,addExclusion,modify);history.append(undo,redo);list.setAttribute('role','tabpanel');list.setAttribute('aria-label',t.zones);element.append(tabs,actions,history,list,empty);parent?.append(element);
 let zones=[],biomes=[],mode='zones',lastAutoIdentity=null,disposed=false,hovered=null,focused=null,external=null,canUndo=false,canRedo=false;
 const rows=new Map(),key=value=>value?value.kind+':'+value.id:null;
 function mark(){for(const [id,row]of rows)row.dataset.highlighted=String(id===key(hovered)||id===key(focused)||id===key(external));}
 function highlightOwner(){mark();onHighlight(hovered??focused??null);}
 function render(){
  t=currentStrings();zonesTab.textContent=t.zones;biomesTab.textContent=t.biomes;tabs.setAttribute('aria-label',t.zones+' / '+t.biomes);addAcquisition.textContent=t.addAcquisition;addExclusion.textContent=t.addExclusion;modify.textContent=t.modify;undo.textContent=t.undo;redo.textContent=t.redo;empty.textContent=t.empty;
  for(const [button,available]of [[undo,canUndo],[redo,canRedo]]){button.disabled=!available;if(available)delete button.dataset.detectionUnavailable;else button.dataset.detectionUnavailable='true';}
  const previousHighlight=key(hovered??focused);
  element.dataset.mode=mode;zonesTab.setAttribute('aria-selected',String(mode==='zones'));biomesTab.setAttribute('aria-selected',String(mode==='biomes'));zonesTab.setAttribute('aria-pressed',String(mode==='zones'));biomesTab.setAttribute('aria-pressed',String(mode==='biomes'));biomesTab.hidden=!biomes.length;actions.hidden=mode!=='zones';list.setAttribute('aria-label',mode==='zones'?t.zones:t.biomes);
  const priority=zone=>zone.kind==='acquisition'?0:zone.role==='text'?2:1;
  const entries=mode==='biomes'?biomes:zones.map((zone,index)=>({zone,index})).sort((a,b)=>priority(a.zone)-priority(b.zone)||a.index-b.index).map(item=>item.zone),kind=mode==='biomes'?'biome':'zone',active=new Set(entries.map(item=>kind+':'+item.id));for(const [id,row]of rows)if(!active.has(id)){row.remove();rows.delete(id);}
  if(hovered&&!active.has(key(hovered)))hovered=null;if(focused&&!active.has(key(focused)))focused=null;
  for(const [index,item]of entries.entries()){
   const id=kind+':'+item.id;let row=rows.get(id);if(!row){row=button('','edit',()=>onEdit({kind,id:item.id}));row.className='detection-regions-item';row.dataset.detectionKind=kind;row.dataset.zoneId=item.id;
    row.addEventListener('pointerenter',()=>{hovered={kind,id:item.id};highlightOwner();});row.addEventListener('pointerleave',()=>{if(key(hovered)===id)hovered=null;highlightOwner();});row.addEventListener('focus',()=>{focused={kind,id:item.id};highlightOwner();});row.addEventListener('blur',()=>{if(key(focused)===id)focused=null;highlightOwner();});rows.set(id,row);
   }
   row.dataset.regionKind=kind==='biome'?'biome':item.kind;row.style.setProperty('--detection-color',kind==='biome'?`rgb(${item.color.join(',')})`:item.kind==='exclusion'?'#e4685b':'#2eaa72');
   row.textContent=(kind==='biome'?t.biome:item.kind==='exclusion'?t.exclusion:t.acquisition)+' '+(index+1);row.title=t.edit+' · '+(kind==='biome'?t.native+' '+(item.nativeGroupIndex??index):item.id);row.setAttribute('aria-label',row.textContent+' · '+t.edit);if(list.children[index]!==row)list.insertBefore(row,list.children[index]??null);
  }
  empty.hidden=!!entries.length;mark();if(previousHighlight!==key(hovered??focused))onHighlight(hovered??focused??null);
 }
 function setMode(next){
  if(disposed)return false;if(!['zones','biomes'].includes(next))throw invalid('Unknown regions panel mode.');if(next==='biomes'&&!biomes.length)return false;if(next===mode)return true;mode=next;hovered=focused=null;render();onHighlight(null);onModeChange(mode);return true;
 }
 function update({zones:nextZones=zones,biomes:nextBiomes=biomes,resultIdentity=null,canUndo:nextCanUndo=canUndo,canRedo:nextCanRedo=canRedo}={}){
  if(disposed)throw invalid('Regions panel disposed.');if(!Array.isArray(nextZones))throw invalid('Regions must be an array.');const ids=new Set();for(const z of nextZones){if(!z||typeof z.id!=='string'||!z.id||ids.has(z.id)||!['acquisition','exclusion'].includes(z.kind))throw invalid('Each region needs a unique ID and acquisition/exclusion role.');ids.add(z.id);}
  const native=validateGroups(nextBiomes);if(resultIdentity!==null&&(typeof resultIdentity!=='string'||!resultIdentity))throw invalid('The native result identity must be a nonempty string.');
  if(typeof nextCanUndo!=='boolean'||typeof nextCanRedo!=='boolean')throw invalid('Undo and redo availability must be boolean.');zones=structuredClone(nextZones);biomes=native;canUndo=nextCanUndo;canRedo=nextCanRedo;
  if(!biomes.length&&mode==='biomes')setMode('zones');else if(biomes.length&&resultIdentity&&resultIdentity!==lastAutoIdentity){lastAutoIdentity=resultIdentity;setMode('biomes');}
  render();return {mode,zones:zones.length,biomes:biomes.length};
 }
 render();return {element,update,setMode,translate:render,highlight(value){if(value!==null&&(!value||!['zone','biome'].includes(value.kind)||typeof value.id!=='string'))throw invalid('Invalid region highlight.');external=value?{...value}:null;mark();},get mode(){return mode;},dispose(){if(disposed)return;disposed=true;hovered=focused=external=null;onHighlight(null);rows.clear();element.remove();}};
}
