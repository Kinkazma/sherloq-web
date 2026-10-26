import {extensionDisplays} from './extension-tools.js';
function ghostDisplayLabels(output,displays,language){
 const same=(a,b)=>a===b||!!(a?.id&&b?.id&&a.id===b.id&&a.revision===b.revision),views=output.data?.views??[],qualities=output.data?.qualities;
 return displays.map((entry,position)=>{
  const retained=entry.display.retainedParameterView?.view,viewIndex=views.findIndex(value=>same(value?.pixels,entry.display)),pathIndex=entry.label.match(/^(?:data\.)?views\.(\d+)(?:\.pixels)?$/),layer=output.layers?.find(value=>value.surfaceId===entry.display.id),layerQuality=/^quality-(\d+)$/.exec(layer?.id??'')?.[1];
  const original=same(output.data?.originalSurface,entry.display)||retained?.layerId==='original'||/(?:^|\.)original(?:Surface)?$/.test(entry.label);
  const index=Number.isInteger(retained?.index)?retained.index:viewIndex>=0?viewIndex:pathIndex?Number(pathIndex[1]):position;
  const quality=retained?.quality??views[index]?.quality??qualities?.[index]??(layerQuality===undefined?undefined:Number(layerQuality));
  if(original)return{...entry,label:language==='en'?'Original image':'Image originale',ghost:{index,original:true}};
  if(Number.isFinite(quality))return{...entry,label:(language==='en'?'Quality ':'Qualité ')+quality,ghost:{index,original:false,quality}};
  return entry;
 });
}
/** Display handles must belong to the engine which will read them. Metadata
 * can describe an input owned by a different worker and is not a display. */
export function resultDisplays(output,{neuralDisplays=()=>null,language='fr'}={}){
 if(output.operation==='various.ocr')return (output.parameterViews??[]).filter(Boolean).map(display=>({label:language==='fr'?'Texte reconnu':'Recognized text',display}));
 const extensions=extensionDisplays(output,language);if(extensions)return extensions;
 const neural=neuralDisplays(output,language);if(neural)return neural;
 const found=[],seen=new Set(),english=language==='en';
 function visit(value,path){
  if(!value||typeof value!=='object'||ArrayBuffer.isView(value))return;
  if(value.width&&value.height&&value.format&&((value.id&&value.revision)||value.data instanceof Uint8Array)){
   const key=value.id||path;if(!seen.has(key)){seen.add(key);const names=english?{probability:'RITA — scores',mask:'RITA — mask',overlay:'RITA — overlay',map:'Anomaly map',map_alternative:'Heatmap — alternative palette',confidence:'Confidence',noiseprint_pp:'Noiseprint++'}:{probability:'RITA — scores',mask:'RITA — masque',overlay:'RITA — superposition',map:'Carte des anomalies',map_alternative:'Carte de chaleur — palette alternative',confidence:'Confiance',noiseprint_pp:'Noiseprint++'},numbered=english?['Overlay','Map','Grids / map']:['Superposition','Carte','Grilles / carte'];found.push({label:value.m2Result?names[value.view]??numbered[value.view]:path||'Résultat',display:value.id?value:{...value,pixels:value}});}return;
  }
  // The admitted crop is an owned comparison input, never a result layer.
  // Its handle remains in the result for lifetime accounting and source view.
  for(const [key,child]of Object.entries(value)){if(['provenance','metrics','sourceRegionSourceSurface','sourceRegionDomain','analysis_scope','native_context_status'].includes(key))continue;visit(child,path?path+'.'+key:key);}
 }
 // M2 explicitly publishes its own render handles. Its source descriptor in
 // data.source belongs to the M2 decoder, not the UI's original-image engine.
 if(Array.isArray(output.parameterViews))visit(output.parameterViews,'views');else if(output.m2Result&&Array.isArray(output.views))visit(output.views,'views');else visit(output,'');
 // The scientific producer declares its RGB/mask order independently of the
 // object's serialization order. Retained packets can carry masks before the
 // published primary RGB; a tiny native mask must not become the default view.
 const declared=new Map();for(const layer of output.layers??[])if(typeof layer.surfaceId==='string'&&!declared.has(layer.surfaceId))declared.set(layer.surfaceId,{index:declared.size,id:layer.id});
 const ordered=declared.size?found.map(entry=>{const layer=declared.get(entry.display.id);return layer?{...entry,layerId:layer.id}:entry;}).sort((a,b)=>(declared.get(a.display.id)?.index??Infinity)-(declared.get(b.display.id)?.index??Infinity)):found;
 return output.operation==='jpeg.ghosts'?ghostDisplayLabels(output,ordered,language):ordered;
}
