import {doctamperNativeSummary} from './doctamper-native-summary.js?v=0.25.0';
import {comprintNativeSummary} from './comprint-native-summary.js?v=0.25.0';
// UI metadata only. The core owns decoding, model loading, scheduling and results.
// Sizes identify the exported ONNX files, not a claim about cached resources.
export const EXTENSION_MODEL_ASSETS=Object.freeze({
 "bfree": {
  "models/bfree/encoder.onnx": {
   "bytes": 346253355,
   "sha256": "aafa23f59e64ec4257a6ba3ad29955db5ff517baab0a257062d728fce0d3e3ee"
  }
 },
 "spai": {
  "models/spai/aggregator.onnx": {
   "bytes": 77925562,
   "sha256": "aa383b8d09530463ed32605a191151153a2f629664306148f59731c11fbd7f22"
  },
  "models/spai/encoder.onnx": {
   "bytes": 453096948,
   "sha256": "fcff9d05d2d1d2adff6288303206160e3b94bb28d6391c00bab9f34085558cdc"
  }
 },
 "doctamper": {
  "models/doctamper/doctamper.onnx": {
   "bytes": 268570166,
   "sha256": "a8c8ab115523350f03f42005f0b724ed8fee828acd283b47b3cf44678dfc4f73"
  }
 },
 "comprint": {
  "models/comprint/comprint.onnx": {
   "bytes": 2677173,
   "sha256": "229a9ff0b45bda46279ec790893b15ae0bd68faf83c3936be992b994e9045e68"
  }
 },
});
export const EXTENSION_TOOLS=Object.freeze([
 {id:'ai.generation.bfree',method:'bfree',fr:'⚠️ B-Free — Détecteur d’IA',en:'⚠️ B-Free — AI detector',group:'AI Solutions',kind:'global',experimental:true},
 {id:'ai.generation.spai',method:'spai',fr:'⚠️ SPAI — Détecteur d’IA',en:'⚠️ SPAI — AI detector',group:'AI Solutions',kind:'global',experimental:true},
 {id:'ai.text.doctamper',method:'doctamper',fr:'⚠️ DTD — Textes documentaires',en:'⚠️ DTD — Documentary text',group:'Tampering',kind:'map',experimental:true},
 {id:'jpeg.comprint',method:'comprint',fr:'Comprint — Empreinte de compression',en:'Comprint — Compression fingerprint',group:'JPEG',kind:'map'}
].map(tool=>Object.freeze({...tool,newFeature:'yellow'})));
export const extensionTool=id=>EXTENSION_TOOLS.find(t=>t.id===id);
export const isExtensionTool=id=>!!extensionTool(id);
export const isExperimentalTool=id=>extensionTool(id)?.experimental===true;
export function extensionConfiguration(){const baseURL=new URL('./extension-engine/',import.meta.url).href;return {baseURL,moduleURL:new URL('engine.js',baseURL).href,resultStorage:'temporary'};}
export function extensionModelAssets(id){
 const methods=[extensionTool(id)?.method];
 return Object.fromEntries(methods.flatMap(method=>Object.entries(EXTENSION_MODEL_ASSETS[method]??{})));
}
export function extensionWeightBytes(id){return Object.values(extensionModelAssets(id)).reduce((sum,a)=>sum+a.bytes,0);}
export function extensionProgressText(event,language='fr'){
 const fr=language!=='en',phase=String(event.phase??''),path=event.model??event.asset??event.path??event.url??'',bytes=event.loadedBytes??event.completedBytes??event.loaded,total=event.totalBytes;
 const download=/download|fetch|asset.*load/i.test(phase);
 let text=download?(fr?'Téléchargement des modèles':'Downloading models'):phase==='model-load'?(fr?'Chargement du modèle':'Loading model'):(fr?'Calcul':'Computing');
 text+=' · '+phase+(event.method?' · '+event.method:'')+(path?' · '+String(path).split('/').at(-1):'');
 if(download&&Number.isFinite(bytes)&&Number.isFinite(total)&&total>0)text+=` · ${bytes.toLocaleString(language)} / ${total.toLocaleString(language)} ${fr?'octets':'bytes'}`;
 else if(Number.isFinite(event.completed)&&Number.isFinite(event.total)&&event.total>0)text+=` · ${event.completed}/${event.total}`;
 return text;
}
export function extensionSummary(output,language='fr'){
 if(!isExtensionTool(output?.operation))return null;
 if(output.status!=='error')return [...comprintNativeSummary(output,language),...doctamperNativeSummary(output,language)];
 const tool=extensionTool(output.operation);
 return [{label:tool?.[language!=='en'?'fr':'en']??output.operation,status:output.status,text:(output.error?.code??'ERROR')+' · '+(output.error?.message??'')}];
}
export function extensionDisplays(output,language='fr'){
 if(!isExtensionTool(output?.operation))return null;
 if(output.operation==='ai.text.doctamper'&&output.surface){
  const fr=language!=='en',label=extensionTool(output.operation)[fr?'fr':'en'];
  return ['heat','overlay'].map(mode=>({label:(mode==='overlay'?(fr?'Superposition':'Overlay'):(fr?'Carte de chaleur':'Heatmap')),display:{...output.surface,format:'rgb8',dtdPresentation:{mode,score:output.surface}}}));
 }
 const fr=language!=='en',found=[],seen=new Set(),names=fr?{foreground:'Activation du texte',analyzed:'Validité — blanc = analysé',mask:'Masque au seuil déclaré',anomaly:'Distance de compression',fingerprint:'Empreinte brute'}:{foreground:'Text activation',analyzed:'Validity — white = processed',mask:'Mask at declared threshold',anomaly:'Compression distance',fingerprint:'Raw fingerprint'};
 for(const result of [output]){
  const label=extensionTool(result.operation)?.[fr?'fr':'en']??result.operation,primary=result.layers?.[0]?.id??'map';
  for(const[key,display]of [[primary,result.surface],...Object.entries(result.planeSurfaces??{}),...Object.entries(result.maskSurfaces??{})])if(display?.id&&!seen.has(display.id)){seen.add(display.id);found.push({label:label+' · '+(names[key]??key),display});}
 }
 if(output.operation==='jpeg.comprint'&&output.surface){
  const score=output.surface,label=extensionTool(output.operation)[fr?'fr':'en'];
  const names=fr?{'heat':'Carte de chaleur','heat-overlay':'Chaleur + photo','gray':'Niveaux de gris'}:{'heat':'Heatmap','heat-overlay':'Heatmap + photo','gray':'Grayscale map'};
  return [...Object.entries(names).map(([mode,name])=>({label:name,display:{...score,format:'rgb8',comprintPresentation:{mode,score}}})),...found.filter(view=>view.display.id!==score.id)];
 }
 return found;
}
