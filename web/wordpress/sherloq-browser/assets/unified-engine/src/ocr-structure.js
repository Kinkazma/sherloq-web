import "../../runtime-context.js?v=0.24.0";
import {requireValue} from './errors.js';

export const OCR_PSM=Object.freeze([3,4,6,7,8,10,11,13]);
export function ocrParameters(value={}){
 const p={algorithm:'tesseract',language:'eng',psm:11,threshold:0,orientationCorrection:true,bitmapThreshold:.2,boxThreshold:.45,unclipRatio:1.4,...value};
 requireValue(['tesseract','ppocr-medium'].includes(p.algorithm),'Unknown OCR algorithm.');
 requireValue(['eng','fra','eng+fra'].includes(p.language),'Unsupported OCR language.');
 requireValue(OCR_PSM.includes(p.psm),'Unsupported OCR page segmentation mode; OSD resources are not configured.');
 requireValue(typeof p.threshold==='number'&&Number.isFinite(p.threshold)&&p.threshold>=0&&p.threshold<=1,'OCR display threshold must be between zero and one.');
 requireValue(typeof p.orientationCorrection==='boolean','OCR orientation correction must be a boolean.');
 for(const key of ['bitmapThreshold','boxThreshold'])requireValue(typeof p[key]==='number'&&Number.isFinite(p[key])&&p[key]>0&&p[key]<1,'OCR detector thresholds must be strictly between zero and one.');
 requireValue(typeof p.unclipRatio==='number'&&Number.isFinite(p.unclipRatio)&&p.unclipRatio>0,'OCR unclip ratio must be positive and finite.');
 return p;
}

/** Native word coordinates, with exclusive right/bottom bounds. Unlike the
 * clone-exclusion parser, no confidence, vocabulary or background filter is
 * applied. TSV hierarchy is retained as reading-order evidence. */
export function parseOcrTsv(tsv,{origin=[0,0],width,height,tile=0}={}){
 requireValue(typeof tsv==='string'&&[width,height].every(n=>Number.isSafeInteger(n)&&n>0)&&Array.isArray(origin)&&origin.length===2&&origin.every(Number.isSafeInteger),'Invalid OCR transcript geometry.');
 const lines=tsv.split(/\r?\n/),headers=lines.shift().split('\t'),columns=Object.fromEntries(headers.map((name,i)=>[name,i]));
 requireValue(['level','left','top','width','height','conf','text'].every(k=>k in columns),'OCR TSV is missing native word fields.');
 const words=[];
 for(const line of lines){
  const row=line.split('\t');if(row[columns.level]!=='5')continue;
  const text=row.slice(columns.text).join('\t');if(!text.length)continue;
  const [x,y,w,h]=['left','top','width','height'].map(k=>Number(row[columns[k]])),confidence=Number(row[columns.conf]);
  requireValue([x,y,w,h].every(Number.isSafeInteger)&&Number.isFinite(confidence)&&confidence>=-1&&confidence<=100,'Invalid native OCR word geometry or confidence.');
  if(w<=0||h<=0)continue;
  const bounds=[Math.max(0,x+origin[0]),Math.max(0,y+origin[1]),Math.min(width,x+origin[0]+w),Math.min(height,y+origin[1]+h)];
  if(bounds[2]<=bounds[0]||bounds[3]<=bounds[1])continue;
  const hierarchy=['page_num','block_num','par_num','line_num','word_num'].map(k=>Number(row[columns[k]]??0));
  requireValue(hierarchy.every(n=>Number.isSafeInteger(n)&&n>=0),'Invalid OCR hierarchy.');
  words.push({text,bounds,polygon:[[bounds[0],bounds[1]],[bounds[2],bounds[1]],[bounds[2],bounds[3]],[bounds[0],bounds[3]]],confidence,score:Math.max(0,confidence)/100,confidenceScale:'tesseract-0-100',tile,hierarchy,lineKey:[tile,...hierarchy.slice(0,4)].join('/')});
 }
 return words;
}
const area=b=>(b[2]-b[0])*(b[3]-b[1]);
const order=(a,b)=>a.bounds[1]-b.bounds[1]||a.bounds[0]-b.bounds[0]||(a.tile??0)-(b.tile??0);
export function deduplicateOcrWords(regions){
 const kept=[];
 for(const word of [...regions].sort((a,b)=>b.score-a.score||order(a,b))){
  const b=word.bounds;
  if(kept.some(other=>{if((other.tile??0)===(word.tile??0))return false;const q=other.bounds,common=Math.max(0,Math.min(b[2],q[2])-Math.max(b[0],q[0]))*Math.max(0,Math.min(b[3],q[3])-Math.max(b[1],q[1]));return common/Math.max(1,Math.min(area(b),area(q)))>.8&&word.text.normalize('NFC')===other.text.normalize('NFC');}))continue;
  kept.push(word);
 }
 return kept.sort(order);
}
export function ocrTextLines(regions){
 const groups=new Map();for(const region of regions){const key=region.lineKey??String(groups.size);let g=groups.get(key);if(!g){g=[];groups.set(key,g);}g.push(region);}
 return [...groups.values()].map(words=>{words.sort((a,b)=>a.bounds[0]-b.bounds[0]);return {text:words.map(w=>w.text).join(' '),bounds:[Math.min(...words.map(w=>w.bounds[0])),Math.min(...words.map(w=>w.bounds[1])),Math.max(...words.map(w=>w.bounds[2])),Math.max(...words.map(w=>w.bounds[3]))],regions:words};}).sort(order);
}
export function immutableOcr(value){if(value&&typeof value==='object'&&!Object.isFrozen(value)){for(const item of Object.values(value))immutableOcr(item);Object.freeze(value);}return value;}
