/** OCR presentation borrows native source pixels and immutable recognition.
 * Confidence is an engine score, not a calibrated correctness probability.
 */
import {copyDiagnosticText} from './error-journal.js?v=0.24.0';

export const ocrThreshold=value=>Number.isFinite(value)?Math.max(0,Math.min(1,value)):0;
export function visibleOcrRegions(data,threshold=0){
 const cutoff=ocrThreshold(threshold);
 return (data?.regions??[]).filter(region=>typeof region.text==='string'&&region.text.length&&Number.isFinite(region.score??region.confidence/100)&&(region.score??region.confidence/100)>=cutoff);
}
export function ocrText(data,threshold=0){
 const regions=visibleOcrRegions(data,threshold);
 if(regions.length===(data?.regions?.length??0)&&typeof data?.text==='string')return data.text;
 if(Array.isArray(data?.lines)&&data.lines.every(line=>Array.isArray(line.regions)))return data.lines.map(line=>visibleOcrRegions({regions:line.regions},threshold).sort((a,b)=>a.bounds[0]-b.bounds[0]).map(region=>region.text).join(' ')).filter(Boolean).join('\n');
 const lines=new Map();
 for(const region of regions){const key=region.lineKey??region.lineId??region.line??region.id;const line=lines.get(key)??[];line.push(region);lines.set(key,line);}
 return [...lines.values()].map(words=>words.sort((a,b)=>a.bounds[0]-b.bounds[0]).map(region=>region.text).join(' ')).join('\n');
}
export function ocrDisplay(output,source,params=output?.provenance?.params??{}){
 if(!source||!output?.data)return null;
 return {id:'ocr-view-'+output.id,revision:1,width:source.width,height:source.height,format:'rgb8',retainedParameterView:true,ocrPresentation:{source,regions:output.data.regions??[],lines:output.data.lines??[],text:output.data.text??'',threshold:ocrThreshold(params.threshold),view:params.view??'overlay'}};
}
export function updateOcrPresentation(output,params,source){
 if(output?.operation!=='various.ocr')return null;
 const previous=output.provenance?.params??{};
 if(['algorithm','language','psm','orientationCorrection','bitmapThreshold','boxThreshold','unclipRatio'].some(key=>params[key]!==undefined&&params[key]!==previous[key]))return null;
 const next={...output,provenance:{...output.provenance,params:{...previous,threshold:ocrThreshold(params.threshold),view:params.view??previous.view??'overlay'}},metrics:{...output.metrics,presentation:{recognitionCalls:0,sourceUnchanged:true}}};
 next.parameterViews=[ocrDisplay(next,source??output.parameterViews?.[0]?.ocrPresentation?.source)];return next;
}
export async function renderOcrWindow(display,tile,readSource){
 const p=display.ocrPresentation,base=await readSource(p.source,tile);
 if(p.view==='text')return base;
 const step=tile.step??1,{width,height}=base,data=base.data;
 const paint=(x,y)=>{const xx=Math.round((x-tile.x)/step),yy=Math.round((y-tile.y)/step);if(xx>=0&&xx<width&&yy>=0&&yy<height)data.set([36,215,151],(yy*width+xx)*3);};
 for(const region of visibleOcrRegions({regions:p.regions},p.threshold)){
  const b=region.bounds;if(!Array.isArray(b)||b.length!==4||!b.every(Number.isFinite))continue;
  if(b[2]<tile.x||b[3]<tile.y||b[0]>tile.x+tile.w||b[1]>tile.y+tile.h)continue;
  const polygon=Array.isArray(region.polygon)&&region.polygon.length>=3?region.polygon:[[b[0],b[1]],[b[2]-1,b[1]],[b[2]-1,b[3]-1],[b[0],b[3]-1]];
  for(let edge=0;edge<polygon.length;edge++){
   const a=polygon[edge],z=polygon[(edge+1)%polygon.length];if(!Array.isArray(a)||!Array.isArray(z)||![...a,...z].every(Number.isFinite))continue;
   // Clip the iteration span to the requested window; a native long line must
   // not turn a small viewport/export band into an unbounded loop.
   let lo=0,hi=1;const dx=z[0]-a[0],dy=z[1]-a[1];let visible=true;
   for(const [v,q]of [[-dx,a[0]-tile.x],[dx,tile.x+tile.w-a[0]],[-dy,a[1]-tile.y],[dy,tile.y+tile.h-a[1]]]){if(v===0){if(q<0)visible=false;}else{const t=q/v;if(v<0)lo=Math.max(lo,t);else hi=Math.min(hi,t);}}
   if(!visible||lo>hi)continue;const count=Math.max(1,Math.ceil(Math.max(Math.abs(dx),Math.abs(dy))*(hi-lo)/step));
   for(let i=0;i<=count;i++){const t=lo+(hi-lo)*i/count;paint(a[0]+dx*t,a[1]+dy*t);}
  }
 }
 return base;
}
export function renderOcrText(document,parent,output,{threshold=0,language='fr',notify=()=>{},copyButton=true}={}){
 const fr=language==='fr',section=document.createElement('section'),header=document.createElement('div'),title=document.createElement('strong'),copy=document.createElement('button'),text=document.createElement('textarea'),count=visibleOcrRegions(output.data,threshold).length,value=ocrText(output.data,threshold);
 section.className='ocr-result';header.className='ocr-result-heading';title.textContent=fr?'Texte reconnu':'Recognized text';copy.type='button';copy.textContent=fr?'Copier le texte':'Copy text';copy.disabled=!value;
 copy.onclick=async()=>{try{await copyDiagnosticText(document,value,{label:fr?'Texte reconnu':'Recognized text'});notify(fr?'Texte copié.':'Text copied.');}catch(error){notify((fr?'Copie impossible : ':'Could not copy: ')+error.message);}};
 text.readOnly=true;text.value=value;text.rows=Math.max(3,Math.min(12,value.split('\n').length+1));text.setAttribute('aria-label',title.textContent);text.placeholder=fr?'Aucun texte reconnu avec ce seuil.':'No text recognized at this threshold.';
 const summary=document.createElement('span');summary.textContent=fr?`${count} zone${count>1?'s':''}`:`${count} region${count!==1?'s':''}`;header.append(title,summary);if(copyButton)header.append(copy);section.append(header,text);parent.append(section);return section;
}
