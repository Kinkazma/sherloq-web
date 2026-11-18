import {EngineError,checkAbort,requireValue} from './unified-engine/src/errors.js';
// Presentation and bounded scalar reads. Scientific arrays remain worker-owned.
export const SPLICEBUSTER_OPERATION='m2.splicebuster';
export const SPLICEBUSTER_VIEWS=Object.freeze(['map','valid']);

export function splicebusterViews(metadata){return metadata?.metadata?.abstained?[]:SPLICEBUSTER_VIEWS;}
export function splicebusterViewLabel(view,language='fr'){
 const labels=language==='en'?{map:'Anomalies · raw score',valid:'Cell validity'}:{map:'Anomalies · score brut',valid:'Validité des cellules'};
 return labels[view]??view;
}
export function splicebusterExplanation(language='fr'){
 return language==='en'
  ?'Splicebuster analyzes texture and noise inconsistencies across the whole image. Higher scores indicate stronger statistical anomalies, without assigning a probability of forgery. Cell validity identifies the cells used to estimate the model.'
  :'Splicebuster analyse les incohérences de texture et de bruit sur l’image entière. Les scores élevés signalent des anomalies statistiques, sans attribuer de probabilité de falsification. La validité indique les cellules utilisées pour estimer le modèle.';
}
export function createSplicebusterSummary(document,output,language='fr'){
 const fr=language!=='en',meta=output?.data?.metadata??{},section=document.createElement('section');section.dataset.splicebusterSummary='';
 const title=document.createElement('strong');title.textContent='Splicebuster';section.append(title);
 const note=document.createElement('p');note.textContent=meta.abstained
  ?(fr?'Aucune cellule exploitable : Splicebuster ne produit pas de carte d’anomalies pour cette image.':'No usable cells: Splicebuster does not produce an anomaly map for this image.')
  :(fr?'La carte affiche un score statistique brut. La vue Validité décrit le support de l’estimation.':'The map displays a raw statistical score. The Validity view describes the support used for estimation.');section.append(note);
 const values=[];
 if(Number.isSafeInteger(meta.validCells)&&Number.isSafeInteger(meta.totalCells))values.push([fr?'Cellules utilisées / total':'Cells used / total',meta.validCells.toLocaleString(language)+' / '+meta.totalCells.toLocaleString(language)]);
 if(Number.isFinite(meta.minimum))values.push([fr?'Score brut minimal':'Minimum raw score',String(meta.minimum)]);
 if(Number.isFinite(meta.maximum))values.push([fr?'Score brut maximal':'Maximum raw score',String(meta.maximum)]);
 if(values.length){const table=document.createElement('table');for(const [label,value]of values){const row=document.createElement('tr'),key=document.createElement('th'),cell=document.createElement('td');key.textContent=label;cell.textContent=value;row.append(key,cell);table.append(row);}section.append(table);}
 return section;
}

const SCALAR_WINDOW_BYTES=4*1024**2;
// Identical native-centre boundary and tie rule to the worker's renderer.
function nearest(axis,value,step){
 if(!axis.length||value<axis[0]-(axis.length>1?axis[1]-axis[0]:step)/2||value>axis.at(-1)+(axis.length>1?axis.at(-1)-axis.at(-2):step)/2)return -1;
 let lo=0,hi=axis.length-1;while(lo<hi){const mid=(lo+hi)>>1;if(axis[mid]<value)lo=mid+1;else hi=mid;}
 return lo>0&&value-axis[lo-1]<=axis[lo]-value?lo-1:lo;
}
/** Scientific values sampled at native source coordinates, without conversion
 * through display colours or f32. Each result window and each RPC is <=4 MiB.
 * Full-grid maps are never copied: one useful grid-row span is held at a time.
 * Outside the outer half-cell boundary, map=NaN and valid=0.
 */
export async function readSplicebusterScalar({width,height,metadata,rect,field='map',readArray,signal}={}){
 requireValue(['map','valid'].includes(field)&&typeof readArray==='function','Unknown Splicebuster scalar field.');
 requireValue([width,height].every(n=>Number.isSafeInteger(n)&&n>0),'Invalid native Splicebuster source geometry.');
 const {x,y,width:w,height:h}=rect??{},count=w*h;
 requireValue([x,y,w,h].every(Number.isSafeInteger)&&x>=0&&y>=0&&w>0&&h>0&&x<=width-w&&y<=height-h&&Number.isSafeInteger(count),'Invalid native Splicebuster scalar window.');
 if(count>SCALAR_WINDOW_BYTES/8)throw new EngineError('MEMORY_LIMIT','Splicebuster scalar windows must fit 4 MiB at float64 precision; split the requested native window.',{details:{requestedBytes:count*8,maximumWindowBytes:SCALAR_WINDOW_BYTES}});
 const [rows,cols]=metadata?.mapShape??[];
 requireValue([rows,cols].every(n=>Number.isSafeInteger(n)&&n>=0)&&rows<=height&&cols<=width&&(rows===0)===(cols===0)&&Number.isSafeInteger(rows*cols),'Invalid native Splicebuster grid.');
 const Type=field==='map'?Float64Array:Uint8Array,out=new Type(count);if(field==='map')out.fill(NaN);
 checkAbort(signal);if(!rows||!cols)return out;
 const step=metadata?.metadata?.stride??metadata?.metadata?.params?.stride??8;
 requireValue(Number.isFinite(step)&&step>0,'Invalid native Splicebuster grid spacing.');
 async function read(name,offset,length,ArrayType){
  requireValue(length>0&&length*ArrayType.BYTES_PER_ELEMENT<=SCALAR_WINDOW_BYTES,'Splicebuster scalar read exceeds 4 MiB.');checkAbort(signal);
  const data=await readArray(name,offset,length);checkAbort(signal);
  requireValue(data instanceof ArrayType&&data.length===length,'Splicebuster scalar response type/length mismatch.');return data;
 }
 const range0=await read('range0',0,rows,Float64Array),range1=await read('range1',0,cols,Float64Array);
 for(const axis of [range0,range1])for(let i=0;i<axis.length;i++)requireValue(Number.isFinite(axis[i])&&(!i||axis[i]>axis[i-1]),'Splicebuster scalar coordinates must increase strictly.');
 const columns=new Int32Array(w);let first=cols,last=-1;
 for(let xx=0;xx<w;xx++){const index=nearest(range1,x+xx,step);columns[xx]=index;if(index>=0){first=Math.min(first,index);last=Math.max(last,index);}}
 if(last<first)return out;
 let previous=-1,line;const length=last-first+1;
 for(let yy=0;yy<h;yy++){
  checkAbort(signal);const row=nearest(range0,y+yy,step);if(row<0)continue;
  if(row!==previous){line=await read(field,row*cols+first,length,Type);previous=row;}
  for(let xx=0;xx<w;xx++)if(columns[xx]>=0){const value=line[columns[xx]-first];
   requireValue(field==='valid'?(value===0||value===1):(Number.isFinite(value)||Number.isNaN(value)),'Invalid Splicebuster scalar value.');out[yy*w+xx]=value;
  }
  if(yy%128===127){await new Promise(resolve=>setTimeout(resolve,0));checkAbort(signal);}
 }
 return out;
}
