import {validRecompressionSettings} from './recompression-controls.js?v=0.33.1';
import {FIELD_METHODS,FIELD_KEYS,gradientFieldDefaults} from './unified-engine/src/gradient-field-parameters.js';
export const GRADIENT_METHODS=FIELD_METHODS;
const fields=['method','intensity','mode','invert','equalize',...FIELD_KEYS];
export const gradientMethod=value=>FIELD_METHODS.includes(value)?value:'sobel';
export const gradientMethodLabel=(method,language='fr')=>({sobel:'Sobel',krawetz:'Krawetz',disk:language==='fr'?'Disque pondéré (expérimental)':'Weighted disk (experimental)',central:language==='fr'?'Différences centrées':'Central differences',prewitt:'Prewitt',scharr:'Scharr',farid:'Farid–Simoncelli',gaussian:language==='fr'?'Dérivée gaussienne':'Gaussian derivative',kirsch:'Kirsch · 8 directions'})[method]??method;
export function gradientDefaults(method='krawetz'){method=gradientMethod(method);return{method,intensity:method==='sobel'?95:0,mode:2,invert:false,equalize:false,...gradientFieldDefaults(method)};}
export function gradientSettings(parameters={}){const out=gradientDefaults(parameters.method??(Object.keys(parameters).length?'sobel':'krawetz'));for(const key of fields)if(key!=='method'&&Object.hasOwn(parameters,key))out[key]=parameters[key];if(parameters.equalization!==undefined)out.equalization=structuredClone(parameters.equalization);if(parameters.recompression!==undefined)out.recompression=validRecompressionSettings(parameters.recompression);return out;}
export function restoreGradientSettings(value){const out={};if(value&&typeof value==='object'&&!Array.isArray(value))for(const method of FIELD_METHODS){const settings=value[method];if(settings&&typeof settings==='object'&&!Array.isArray(settings))out[method]=gradientSettings({...settings,method});}return out;}
export function changeGradientMethod(parameters,method,retained={}){
 const previous=gradientSettings(parameters),saved=restoreGradientSettings(retained);saved[previous.method]=previous;
 const next=gradientSettings({...previous,method:gradientMethod(method)});
 // A method switch changes the operator, never recalls an older display or
 // preprocessing profile. Adapt only supports absent from the named method.
 if(['central','scharr','kirsch','krawetz'].includes(next.method))next.kernelSize=3;
 else if(next.method==='farid'&&![5,7].includes(next.kernelSize))next.kernelSize=5;
 return{parameters:next,retained:saved};
}
export function gradientFieldVisible(key,p){if(key==='mode')return p.method!=='krawetz'&&p.view==='native';if(key==='kernelSize')return ['sobel','prewitt','farid','gaussian','disk'].includes(p.method);if(key==='sigma')return p.method==='gaussian';if(key==='diskFill')return p.method==='disk';if(key==='preSize')return p.preSigma>0;if(['tensorSize','tensorSigma'].includes(key))return p.view==='coherence';if(key==='invert')return p.view!=='coherence';return true;}
export function syncGradientInput(input,p,{batch=false,locked=false,values=false}={}){const key=input.dataset.parameter,visible=gradientFieldVisible(key,p);input.closest('label').hidden=!visible;input.dataset.inactive=String(!visible);input.disabled=locked||!visible;if(values&&Object.hasOwn(p,key)){if(input.type==='checkbox')input.checked=p[key];else input.value=input.tagName==='SELECT'&&!batch?JSON.stringify(p[key]):String(p[key]);}if(['method','view'].includes(key))input.title=[...input.options].find(option=>option.value===input.value)?.textContent??'';if(key==='kernelSize'){input.min=p.method==='farid'?'5':'3';input.max=p.method==='farid'?'7':'63';input.step='2';}}

export function mountGradientAdvanced(fields,{language='fr'}={}){
 const doc=fields.ownerDocument,advanced=doc.createElement('details'),summary=doc.createElement('summary'),content=doc.createElement('div');advanced.className='gradient-advanced';content.className='gradient-advanced-fields';summary.textContent=language==='fr'?'Réglages avancés':'Advanced settings';advanced.append(summary,content);
 for(const key of FIELD_KEYS){const input=fields.querySelector('[data-parameter="'+key+'"]');if(input)content.append(input.closest('label'));}
 fields.append(advanced);return advanced;
}
export function gradientParameterHelp(key,language='fr'){
 const fr=language==='fr';if(key==='luma')return fr?'BT.601 conserve le gris pondéré usuel. BT.709 linéaire retire la courbe sRGB avant de pondérer les couleurs : les gradients peuvent changer, surtout dans les zones sombres ou colorées.':'BT.601 keeps conventional weighted gray. Linear BT.709 removes the sRGB curve before weighting colors; gradients can change, especially in dark or colored regions.';
 if(key==='border')return fr?'Voisins hors du cadre de l’image ou de l’acquisition : réflexion, répétition du pixel du bord, ou omission. Aucun effet loin des bords. Les exclusions restent omises dans tous les modes.':'Neighbors outside the image or acquisition frame: reflection, repeated edge pixel, or omission. No effect away from edges. Exclusions remain omitted in every mode.';
 if(key==='view')return fr?'Composantes et amplitude (RVB), avec les parcours Sobel/Krawetz d’origine aux réglages natifs. Orientation colorée : teinte HSV selon l’angle, saturation et luminosité selon la force du gradient. Cohérence : régularité locale des orientations, de 0 à 1.':'Components and magnitude (RGB), preserving original Sobel/Krawetz paths at native settings. Colored orientation: HSV hue follows the angle; saturation and value follow gradient strength. Coherence: local orientation consistency, from 0 to 1.';
 return '';
}
