export const defaults={quality:75,scale:50,contrast:20,linear:false,grayscale:false};
export function validParams(p){
 if(!p||typeof p!=='object')throw new Error('Invalid params');
 for(const k of ['quality','scale','contrast'])if(!Number.isInteger(p[k])||p[k]<(k==='contrast'?0:1)||p[k]>100)throw new Error('Invalid '+k);
 for(const k of ['linear','grayscale'])if(typeof p[k]!=='boolean')throw new Error('Invalid '+k);
 return Object.fromEntries(Object.keys(defaults).map(k=>[k,p[k]]));
}
export function validateSettings(value){
 if(!value||value.schema!=='sherloq.settings/1')throw new Error('Expected sherloq.settings/1');
 if(!Array.isArray(value.profiles)||value.profiles.length>100)throw new Error('Invalid profiles (maximum 100)');
 const ids=new Set(),names=new Set();
 const profiles=value.profiles.map(p=>{
  if(!p||typeof p.id!=='string'||!/^profile-[\w-]{1,80}$/.test(p.id)||ids.has(p.id))throw new Error('Invalid profile id');
  if(typeof p.name!=='string'||!p.name.trim()||p.name.length>80||names.has(p.name.trim())||p.operation!=='ela.classic')throw new Error('Invalid profile name or operation');
  ids.add(p.id);names.add(p.name.trim());return{id:p.id,name:p.name.trim(),operation:'ela.classic',params:validParams(p.params)};
 });
 const q=value.preferences;if(!q||typeof q!=='object')throw new Error('Invalid preferences');
 const preferences={navigationMode:q.navigationMode??'auto'};
 if(q.highlightNewFeatures!==undefined){if(typeof q.highlightNewFeatures!=='boolean')throw Error('Invalid highlightNewFeatures');preferences.highlightNewFeatures=q.highlightNewFeatures;}
 if(q.elaMode!==undefined){if(!['classic','energy'].includes(q.elaMode))throw Error('Invalid ELA mode');preferences.elaMode=q.elaMode;}
 if(!['auto','mouse','trackpad'].includes(preferences.navigationMode))throw new Error('Invalid navigationMode');
 for(const [k,choices] of Object.entries({theme:['light','dark'],language:['fr','en'],layout:['tabs','tile','cascade'],computeProfile:['aggressive','maximum'],regionMode:['whole','independent','pair','cross']})){
  if(!choices.includes(q[k]))throw new Error('Invalid '+k);preferences[k]=q[k];
 }
 for(const k of ['favorite','showZones','toolsVisible','inspectorVisible']){if(typeof q[k]!=='boolean')throw new Error('Invalid '+k);preferences[k]=q[k];}
 if(!['native','manual',...ids].includes(value.activeProfile))throw new Error('Invalid active profile');
 const composite=validCompositeSettings(value.composite);
 return{...(value.individual?{individual:validIndividualSettings(value.individual)}:{}),...(value.automatic?{automatic:validAutomaticSettings(value.automatic)}:{}),...(value.composite?{composite:{quality:composite.quality,stage:composite.stage,view:composite.view}}:{}),schema:'sherloq.settings/1',profiles,preferences,current:validParams(value.current),activeProfile:value.activeProfile,...(value.energy?{energy:validEnergySettings(value.energy)}:{})};
}
export function settingsFilename(date=new Date()){return 'SHERLOQ-reglages-'+date.toISOString().replace(/[:.]/g,'-')+'.json';}

export function validEnergySettings(input){
 const v=input??{selected:'standard',values:{histogramLow:10,histogramHigh:990,shadow:50,highlight:50},quality:0,block:32,minimum:3,view:'overlay',opacity:70,profiles:[]};
 const ranges={histogramLow:[0,500],histogramHigh:[500,1000],shadow:[0,200],highlight:[0,200]};
 const values=x=>{if(!x||typeof x!=='object')throw Error('Invalid energy controls');const out={};for(const [k,[lo,hi]]of Object.entries(ranges)){if(!Number.isInteger(x[k])||x[k]<lo||x[k]>hi)throw Error('Invalid energy '+k);out[k]=x[k];}return out;};
 const parameters=x=>{if(!Number.isInteger(x.quality)||x.quality<0||x.quality>100||![16,32,64,96].includes(x.block)||!Number.isInteger(x.minimum)||x.minimum<1||x.minimum>1000)throw Error('Invalid energy parameters');return{quality:x.quality,block:x.block,minimum:x.minimum};};
 if(!Array.isArray(v.profiles)||v.profiles.length>100)throw Error('Invalid energy profiles');const ids=new Set(),names=new Set();
 const profiles=v.profiles.map(p=>{if(!p||typeof p.id!=='string'||!/^profile-[\w-]{1,80}$/.test(p.id)||ids.has(p.id)||typeof p.name!=='string'||!p.name.trim()||p.name.length>80||names.has(p.name.trim()))throw Error('Invalid energy profile');ids.add(p.id);names.add(p.name.trim());return{id:p.id,name:p.name.trim(),values:values(p.values),...parameters(p)};});
 if(!['standard','conservative','sensitive','manual',...ids].includes(v.selected)||!['overlay','labels'].includes(v.view)||!Number.isInteger(v.opacity)||v.opacity<0||v.opacity>100)throw Error('Invalid energy view or profile');
 return{selected:v.selected,values:values(v.values),...parameters(v),view:v.view,opacity:v.opacity,profiles};
}

export function validCompositeSettings(input){
 const value=input??{quality:0,stage:'map',view:'map'};
 if(!Number.isInteger(value.quality)||!(value.quality===0||(value.quality>=51&&value.quality<=101))||!['map','noise'].includes(value.stage)||!['map','noise'].includes(value.view))throw Error('Invalid Composite settings');
 return {quality:value.quality,stage:value.stage,view:value.view};
}

export function validAutomaticSettings(input = {}) {
 const defaults={scope:'detected',source:'overlay',view:'corroboration',relation:'within',branch:'','d2-minimum':500,opacity:70};
 const value={...defaults,...input};
 const choices={scope:['detected','whole','selected'],source:['overlay','PatchMatch Zernike','PatchMatch SIFT','SIFT + G2NN + RANSAC + Panels + Text','Forgeryscope Auto','D2PRL'],view:['corroboration','ela-preview','energy-low','energy-high'],relation:['within','between','all'],branch:['','microscopy','blots','lanes']};
 for(const [key,allowed] of Object.entries(choices))if(!allowed.includes(value[key]))throw Error('Invalid automatic '+key);
 for(const [key,max] of [['d2-minimum',5000],['opacity',100]])if(!Number.isInteger(value[key])||value[key]<0||value[key]>max)throw Error('Invalid automatic '+key);
 return Object.fromEntries(Object.keys(defaults).map(key=>[key,value[key]]));
}

export function validIndividualSettings(value){
 if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).length>64)throw Error('Invalid tool settings');
 const copy=(v,depth=0)=>{if(Array.isArray(v)){if(depth>4||v.length>1000)throw Error('Invalid tool parameter array');return v.map(x=>copy(x,depth+1));}if(v===null||typeof v==='boolean'||typeof v==='string'&&v.length<=4096||typeof v==='number'&&Number.isFinite(v))return v;if(depth>4||!v||typeof v!=='object'||Array.isArray(v)||Object.keys(v).length>64)throw Error('Invalid tool parameter');return Object.fromEntries(Object.entries(v).map(([k,item])=>{if(!/^[a-zA-Z][a-zA-Z0-9.]*$/.test(k)||['constructor','prototype','__proto__'].includes(k))throw Error('Invalid tool parameter name');return [k,copy(item,depth+1)];}));};
 return copy(value);
}
