import {normalizeNativeContextSelection,nativeContextSelectionFor,findNativeContextSelection} from './native-context-selection.js?v=0.25.0';
export function restoreJpegContextViews(value){const restored={};if(!value||typeof value!=='object'||Array.isArray(value))return restored;for(const operation of ['jpeg.quality','jpeg.recompression']){const selection=normalizeNativeContextSelection(value[operation]);if(selection)restored[operation]=selection;}return restored;}
/** Select among already computed native curves. Preferences contain only
 * verified source identity and integer Original bounds, never a reader/signal. */
export function createJpegContextCurveUI({document,output,chart,language='fr',selection,onSelection=()=>{}}){
 const fragments=output.data?.fragments;if(output.data?.independentNativeContexts!==true||!Array.isArray(fragments)||!['jpeg.quality','jpeg.recompression'].includes(output.operation))return null;
 const fr=language!=='en',node=(tag,text)=>{const el=document.createElement(tag);if(text!==undefined)el.textContent=text;return el;},root=node('section'),label=node('label',fr?'Zone de la courbe JPEG ':'JPEG curve region '),select=node('select'),summary=node('p'),plot=node('div');root.className='jpeg-context-curves';select.setAttribute('aria-label',fr?'Zone de la courbe JPEG':'JPEG curve region');
 for(let i=0;i<fragments.length;i++){const f=fragments[i],option=node('option',(fr?'Zone ':'Region ')+(i+1)+' · '+f.nativeDimensions.join(' × '));option.value=String(i);select.append(option);}
 label.append(select);root.append(label,summary,plot);select.disabled=fragments.length<2;
 const matching=findNativeContextSelection(output,fragments,selection),initial=matching>=0?matching:fragments.findIndex(f=>f.evaluable);select.value=String(Math.max(0,initial));
 function draw(){const f=fragments[Number(select.value)];plot.replaceChildren();if(!f){summary.textContent=fr?'Aucune zone disponible.':'No region available.';return;}root.dataset.contextId=f.id;
  if(!f.evaluable){summary.textContent=fr?'Cette zone dépasse les dimensions du codec JPEG natif. Aucune courbe ni estimation n’a été calculée.':'This region exceeds the native JPEG codec dimensions. No curve or estimate was calculated.';return;}
  const data=f.data,quality=output.operation==='jpeg.quality',bounds=f.originalBounds.join(', '),notes=[(fr?'Cadre original : ':'Original bounds: ')+bounds];
  if(quality){notes.push((fr?'Minimum de la courbe : ':'Curve minimum: ')+data.minimum);if(data.estimate)notes.push((fr?'Tables du fichier original : ':'Original file tables: ')+data.estimate.quality);if(data.prediction!==null&&data.prediction!==undefined)notes.push((fr?'Estimation du modèle local : ':'Local model estimate: ')+data.prediction);if(data.metadataError)notes.push(fr?'Les tables JPEG du fichier ne permettent pas d’estimation.':'The file JPEG tables cannot provide an estimate.');else if(data.modelError)notes.push(fr?'Aucun modèle local chargé ; estimation limitée à la courbe.':'No local model loaded; only curve evidence is available.');}
  summary.textContent=notes.join(' · ');const values=quality?data.curve:data.raw;if(values?.length)plot.append(chart([values],{xLabel:(fr?'Qualité JPEG':'JPEG quality')+(quality?' (1–100)':' (0–100)'),yLabel:quality?(fr?'Perte normalisée':'Normalized loss'):(fr?'Erreur moyenne absolue (0–255)':'Mean absolute error (0–255)')}));
 }
 select.onchange=()=>{draw();const fragment=fragments[Number(select.value)],value=fragment&&nativeContextSelectionFor(output,fragment);if(value)onSelection(value);};draw();return root;
}
