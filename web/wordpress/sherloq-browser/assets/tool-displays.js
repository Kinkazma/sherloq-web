import {extensionDisplays} from './extension-tools.js';
/** Display handles must belong to the engine which will read them. Metadata
 * can describe an input owned by a different worker and is not a display. */
export function resultDisplays(output,{neuralDisplays=()=>null,language='fr'}={}){
 const extensions=extensionDisplays(output,language);if(extensions)return extensions;
 const neural=neuralDisplays(output,language);if(neural)return neural;
 const found=[],seen=new Set(),english=language==='en';
 function visit(value,path){
  if(!value||typeof value!=='object'||ArrayBuffer.isView(value))return;
  if(value.width&&value.height&&value.format&&((value.id&&value.revision)||value.data instanceof Uint8Array)){
   const key=value.id||path;if(!seen.has(key)){seen.add(key);const names=english?{probability:'RITA — scores',mask:'RITA — mask',overlay:'RITA — overlay',map:'Anomaly map',map_alternative:'Heatmap — alternative palette',confidence:'Confidence',noiseprint_pp:'Noiseprint++'}:{probability:'RITA — scores',mask:'RITA — masque',overlay:'RITA — superposition',map:'Carte des anomalies',map_alternative:'Carte de chaleur — palette alternative',confidence:'Confiance',noiseprint_pp:'Noiseprint++'},numbered=english?['Overlay','Map','Grids / map']:['Superposition','Carte','Grilles / carte'];found.push({label:value.m2Result?names[value.view]??numbered[value.view]:path||'Résultat',display:value.id?value:{...value,pixels:value}});}return;
  }
  for(const [key,child]of Object.entries(value)){if(['provenance','metrics'].includes(key))continue;visit(child,path?path+'.'+key:key);}
 }
 // M2 explicitly publishes its own render handles. Its source descriptor in
 // data.source belongs to the M2 decoder, not the UI's original-image engine.
 if(Array.isArray(output.parameterViews))visit(output.parameterViews,'views');else if(output.m2Result&&Array.isArray(output.views))visit(output.views,'views');else visit(output,'');
 return found;
}
