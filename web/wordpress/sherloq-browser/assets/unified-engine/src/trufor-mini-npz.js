import "../../runtime-context.js?v=0.33.1";
import {npyHeader,writeNpz} from './npz.js';
import {requireValue} from './errors.js';

/** Mini has a localization map and an empirical summary, no confidence or
 * original learned image detector. Context arrays retain their packed order. */
export function truforMiniNpz(result,maxBytes,writer=writeNpz){
 const d=result.data,m=d?.metadata,fragmented=m?.fragmented===true,n=fragmented?d.pixelCount:d?.width*d?.height,entries=[];
 requireValue(m?.method==='trufor-mini'&&m.scoreKind==='mean_top_1_percent_localization'&&Number.isSafeInteger(n)&&n>=0&&(fragmented||n>0),'Invalid TruFor Mini export geometry or empirical score definition.');
 for(const key of ['map',...(d.noiseprint_pp?['noiseprint_pp']:[])]){
  const value=d[key],segmented=typeof value?.readBytes==='function';
  requireValue((value instanceof Float32Array||segmented&&writer!==writeNpz)&&value.length===n&&(!segmented||value.channels===1),'Mini stored fields require asynchronous streaming export.');
  entries.push({key,value,header:npyHeader('<f4',fragmented?[n]:[d.height,d.width]),bytes:value.byteLength,floating:true,segmented});
 }
 if(fragmented){
  requireValue(d.context_scores instanceof Float64Array&&d.context_scores.every(Number.isFinite)&&Array.isArray(m.fragments),'Invalid empirical Mini context summaries.');
  for(const[key,value,shape] of [
   ['context_scores_top1_percent',d.context_scores,[d.context_scores.length]],
   ['fragment_bounds',new Float64Array(m.fragments.flatMap(f=>f.bounds)),[m.fragments.length,4]],
   ['fragment_shapes',new Float64Array(m.fragments.flatMap(f=>f.shape)),[m.fragments.length,2]],
   ['fragment_offsets',new Float64Array(m.fragments.map(f=>f.offset)),[m.fragments.length]],
   ['fragment_evaluable',new Float64Array(m.fragments.map(f=>Number(f.evaluable))),[m.fragments.length]]
  ])entries.push({key,value,header:npyHeader('<f8',shape),bytes:value.byteLength,floating:true});
 }else{
  requireValue(Number.isFinite(d.score),'Invalid Mini empirical score.');
  entries.push({key:'score_top1_percent',value:new Float64Array([d.score]),header:npyHeader('<f8',[]),bytes:8,floating:true});
 }
 entries.push({key:'imgsize',value:new Uint32Array([d.height,d.width]),header:npyHeader('<i8',[2]),bytes:16,int64:true});
 return writer(result,maxBytes,entries);
}
