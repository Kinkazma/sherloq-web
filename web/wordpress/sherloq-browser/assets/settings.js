export const defaults={quality:75,scale:50,contrast:20,linear:false,grayscale:false};
export function validElaMode(value){
 const mode=value==='energy'?'biomes':value;
 if(!['classic','scores','biomes'].includes(mode))throw Error('Invalid ELA mode');
 return mode;
}
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
 if(q.allSliders!==undefined&&typeof q.allSliders!=='boolean')throw Error('Invalid allSliders');
 preferences.allSliders=q.allSliders!==false;
 if(q.highlightNewFeatures!==undefined){if(typeof q.highlightNewFeatures!=='boolean')throw Error('Invalid highlightNewFeatures');preferences.highlightNewFeatures=q.highlightNewFeatures;}
 if(q.elaMode!==undefined)preferences.elaMode=validElaMode(q.elaMode);
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
 const scoreField=v.scoreField??'unified',storedScoreThreshold=v.scoreThreshold??0,scoreThreshold=scoreField==='both'?storedScoreThreshold:Math.max(0,storedScoreThreshold),scoreView=v.scoreView??'map';
 if(!['low','high','both','unified'].includes(scoreField)||!Number.isFinite(storedScoreThreshold)||!['map','overlay'].includes(scoreView))throw Error('Invalid energy score presentation');
 return{selected:v.selected,values:values(v.values),...parameters(v),view:v.view,opacity:v.opacity,scoreField,scoreThreshold,scoreView,profiles};
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

// Import and release migration recover each field independently. The strict
// validator remains available for scientific task/session validation.
export function defaultSettings(){return{schema:'sherloq.settings/1',profiles:[],current:{...defaults},activeProfile:'native',energy:validEnergySettings(),preferences:{allSliders:true,elaMode:'classic',navigationMode:'auto',theme:'dark',language:'fr',layout:'tabs',computeProfile:'maximum',regionMode:'whole',favorite:false,showZones:true,toolsVisible:true,inspectorVisible:false}};}
export function recoverSettings(input,{fallback=defaultSettings()}={}){
 const issues=[],base=validateSettings(fallback),value=input&&typeof input==='object'&&!Array.isArray(input)?input:{};
 if(value.schema!=='sherloq.settings/1')throw Error('Expected sherloq.settings/1');
 const out=structuredClone(base),issue=(path,error,kind='incompatible')=>issues.push({path,kind,message:error?.message||String(error)});
 const fields=(source,target,validate,path)=>{if(!source||typeof source!=='object'||Array.isArray(source)){if(source!==undefined)issue(path,'Invalid object');return target;}for(const [key,item]of Object.entries(source)){if(!Object.hasOwn(target,key)){issue(path+'.'+key,'Preserved in recovery backup','unknown');continue;}const candidate={...target,[key]:item};try{target=validate(candidate);}catch(error){issue(path+'.'+key,error);}}return target;};
 out.current=fields(value.current,{...out.current},validParams,'current');
 // Profiles keep their identity, name and every compatible parameter. An
 // unusable identity is retained only in the recovery copy, never invented.
 const hasProfiles=Array.isArray(value.profiles),ids=new Set(hasProfiles?[]:base.profiles.map(profile=>profile.id)),names=new Set(hasProfiles?[]:base.profiles.map(profile=>profile.name));out.profiles=hasProfiles?[]:structuredClone(base.profiles);
 if(Array.isArray(value.profiles))for(const [index,p]of value.profiles.entries()){
  const path='profiles.'+index;
  if(index>=100||!p||typeof p.id!=='string'||!/^profile-[\w-]{1,80}$/.test(p.id)||ids.has(p.id)||typeof p.name!=='string'||!p.name.trim()||p.name.length>80||names.has(p.name.trim())||p.operation!=='ela.classic'){issue(path,'Invalid profile identity, name or operation');continue;}
  ids.add(p.id);names.add(p.name.trim());const prior=base.profiles.find(item=>item.id===p.id);
  out.profiles.push({id:p.id,name:p.name.trim(),operation:'ela.classic',params:fields(p.params,{...(prior?.params||defaults)},validParams,path+'.params')});
  for(const key of Object.keys(p))if(!['id','name','operation','params'].includes(key))issue(path+'.'+key,'Preserved in recovery backup','unknown');
 }else if(value.profiles!==undefined)issue('profiles','Invalid profiles');
 // Validate UI fields without making a bad boolean/theme discard other fields.
 out.preferences=fields(value.preferences,{...out.preferences,highlightNewFeatures:out.preferences.highlightNewFeatures??false,allSliders:out.preferences.allSliders??true,elaMode:out.preferences.elaMode??'classic'},q=>validateSettings({...out,activeProfile:'native',preferences:q}).preferences,'preferences');
 if(['native','manual',...ids].includes(value.activeProfile))out.activeProfile=value.activeProfile;else if(value.activeProfile!==undefined){out.activeProfile=['native','manual',...ids].includes(base.activeProfile)?base.activeProfile:'manual';issue('activeProfile','Profile unavailable');}else if(!['native','manual',...ids].includes(out.activeProfile))out.activeProfile='manual';
 if(value.individual!==undefined){out.individual={...base.individual};if(value.individual&&typeof value.individual==='object'&&!Array.isArray(value.individual))for(const [id,parameters]of Object.entries(value.individual))try{Object.assign(out.individual,validIndividualSettings({[id]:parameters}));}catch(error){issue('individual.'+id,error);}else issue('individual','Invalid tool settings');}
 for(const [key,validate]of [['automatic',validAutomaticSettings],['composite',validCompositeSettings]])if(value[key]!==undefined)out[key]=fields(value[key],validate(base[key]),validate,key);
 if(value.energy!==undefined){
  const energy=validEnergySettings(base.energy),v=value.energy;
  if(!v||typeof v!=='object'||Array.isArray(v))issue('energy','Invalid energy settings');else{
   const parameters=['quality','block','minimum','view','opacity','scoreField','scoreThreshold','scoreView'];for(const key of parameters)if(v[key]!==undefined)try{Object.assign(energy,validEnergySettings({...energy,[key]:v[key]}));}catch(error){issue('energy.'+key,error);}
   energy.values=fields(v.values,{...energy.values},values=>validEnergySettings({...energy,values}).values,'energy.values');
   const priorProfiles=energy.profiles,hasProfiles=Array.isArray(v.profiles);energy.profiles=hasProfiles?[]:priorProfiles;const energyIds=new Set(hasProfiles?[]:priorProfiles.map(profile=>profile.id)),energyNames=new Set(hasProfiles?[]:priorProfiles.map(profile=>profile.name));
   if(Array.isArray(v.profiles))for(const [index,p]of v.profiles.entries()){
    const path='energy.profiles.'+index;if(index>=100||!p||typeof p.id!=='string'||!/^profile-[\w-]{1,80}$/.test(p.id)||energyIds.has(p.id)||typeof p.name!=='string'||!p.name.trim()||p.name.length>80||energyNames.has(p.name.trim())){issue(path,'Invalid energy profile');continue;}
    const prior=base.energy?.profiles.find(item=>item.id===p.id),candidate={id:p.id,name:p.name.trim(),values:{...(prior?.values||energy.values)},quality:prior?.quality??energy.quality,block:prior?.block??energy.block,minimum:prior?.minimum??energy.minimum};
    const profileCheck=x=>validEnergySettings({...energy,profiles:[x],selected:x.id}).profiles[0];candidate.values=fields(p.values,candidate.values,values=>profileCheck({...candidate,values}).values,path+'.values');
    for(const key of ['quality','block','minimum'])if(p[key]!==undefined)try{Object.assign(candidate,profileCheck({...candidate,[key]:p[key]}));}catch(error){issue(path+'.'+key,error);}
    energyIds.add(p.id);energyNames.add(p.name.trim());energy.profiles.push(candidate);
   }else if(v.profiles!==undefined)issue('energy.profiles','Invalid energy profiles');
   if(['standard','conservative','sensitive','manual',...energyIds].includes(v.selected))energy.selected=v.selected;else if(v.selected!==undefined){energy.selected='manual';issue('energy.selected','Energy profile unavailable');}else if(!['standard','conservative','sensitive','manual',...energyIds].includes(energy.selected))energy.selected='manual';
  }out.energy=energy;
 }
 for(const key of Object.keys(value))if(!['schema','profiles','current','activeProfile','preferences','individual','automatic','composite','energy','exportedAt'].includes(key))issue(key,'Preserved in recovery backup','unknown');
 return {value:validateSettings(out),issues};
}
