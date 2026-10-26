import {Budget} from './cache.js';
import {segmentationNpz} from '../experiments/segmentation/npz.js';
import {zeroNpz,noisesnifferNpz,energyNpz,elaCellNpz,d2prlNpz,m3Npz} from './npz.js';
import {EngineError,requireValue} from './errors.js';
import {CANDIDATE_CSV_HEADER,candidateCsvLine} from './candidate-table.js';

// Shared conservative text bound; callers can reserve the actual bounded JSON
// work instead of allocating the configured maximum for every small manifest.
export function jsonExportBound(v){if(ArrayBuffer.isView(v))return v.length*32+2;if(v===null||typeof v!=='object')return typeof v==='string'?v.length*6+2:32;return Object.entries(v).reduce((n,[k,x])=>n+k.length*6+jsonExportBound(x)+4,2);}

// Exports are explicit derived files. This never changes or re-encodes the source.
export function exportAnalysis(result,{format='json',maxBytes=32*1024**2}={}){
 requireValue(result?.status==='ok'&&result.provenance&&typeof result.operation==='string','Expected a completed engine result.');
 requireValue(Number.isSafeInteger(maxBytes)&&maxBytes>0,'Positive export byte limit required.');
 if(format==='npz'){if(result.operation==='ela.biomes')return elaCellNpz(result,maxBytes);if(result.operation==='noise.noisesniffer'&&result.layout==='surface')throw new EngineError('UNSUPPORTED_EXPORT','Use readNpz pages for a stored Noisesniffer result.');if(['tampering.copyMove.sparse','ai.sources.safire','ai.localization.focal','ai.localization.adaifl'].includes(result.operation))return m3Npz(result,maxBytes);if(result.operation==='ai.clones.segmentation'){const exported=segmentationNpz(result.data,{budget:new Budget(maxBytes),maxBytes,provenance:result.provenance});try{return {mime:exported.mime,bytes:exported.bytes};}finally{exported.release();}}if(result.operation==='ai.clones.d2prl')return d2prlNpz(result,maxBytes);if(result.operation==='ela.energy')return energyNpz(result,maxBytes);if(result.operation==='jpeg.zero')return zeroNpz(result,maxBytes);if(result.operation==='noise.noisesniffer')return noisesnifferNpz(result,maxBytes);throw new EngineError('UNSUPPORTED_EXPORT','NPZ is unavailable for this operation.');}
 let text,mime;
 if(format==='json'){
  // Upper bound prevents an enormous temporary JSON string before admission.
  if(jsonExportBound(result)>maxBytes)throw new EngineError('MEMORY_LIMIT','JSON export exceeds its conservative byte budget.');
  text=JSON.stringify(result,(_,value)=>ArrayBuffer.isView(value)?Array.from(value):value);mime='application/json';
 }else if(format==='csv'){
  const lines=[];let bytes=0;
  function line(fields){const value=fields.join(',')+'\r\n';bytes+=value.length;if(bytes>maxBytes)throw new EngineError('MEMORY_LIMIT','CSV export exceeds its byte budget.');lines.push(value);}
  if(result.operation==='pixels.defects'){
   if(result.tables?.candidates)throw new EngineError('UNSUPPORTED_EXPORT','Use readTableCsv pages for a stored candidate table.');
   line(CANDIDATE_CSV_HEADER.trimEnd().split(','));
   const rows=result.data.candidates,p=result.provenance.params;
   for(let i=0;i<rows.length;i+=6)line(candidateCsvLine(rows,i,p).trimEnd().split(','));
  }else if(result.operation==='various.illuminant'){
   line(['x','y','width','height','valid_pixels','total_pixels','valid_estimate','R_unit','G_unit','B_unit','angle_to_global_degrees','global_R_unit','global_G_unit','global_B_unit','method','linearize_srgb','exclude_dark_clipped']);
   const d=result.data,p=result.provenance.params,shape=result.pixels??result.surface;
   requireValue(shape&&Number.isSafeInteger(shape.width)&&shape.width>0&&Number.isSafeInteger(shape.height)&&shape.height>0,'Illuminant export requires source dimensions.');
   for(let i=0;i<d.valid.length;i++){const x=i%d.cols*p.block,y=Math.floor(i/d.cols)*p.block;line([x,y,Math.min(p.block,shape.width-x),Math.min(p.block,shape.height-y),d.counts[i],d.areas[i],d.valid[i],...d.rgb.subarray(i*3,i*3+3),d.angles[i],...d.globalRGB,['Gray World','Shades of Gray p=6','White Patch'][p.method],Number(p.linear),Number(p.exclude)]);}
  }else if(result.operation==='noise.prnu'){
   line(['rank','camera','ncc','experimental_threshold','reaches_threshold','training_membership_verified']);
   const d=result.data,quote=value=>'"'+String(value).replaceAll('"','""')+'"';
   for(const item of d.scores)line([item.rank,quote(item.camera),item.score,d.threshold,Number(item.score>=d.threshold),Number(d.trainingMembershipVerified)]);
  }else if(result.operation==='comparison.image'){
   line(['metric','value','status','detail']);
   const d=result.data,quote=value=>'"'+String(value??'').replaceAll('"','""')+'"';
   for(const metric of ['rmse','sam','ergas','mb','pfe','psnr','ssim','msssim','rase','scc','uqi','vifp','ssimul','butter','hist_0','hist_1','hist_4','hist_2','hist_3','hist_5']){
    if(Object.hasOwn(d.values,metric))line([metric,d.values[metric],'defined',quote(d.warnings?.[metric])]);
    else if(Object.hasOwn(d.errors,metric))line([metric,'','undefined',quote(d.errors[metric])]);
   }
   if(d.metricsRequested){line(['histogramCorrelationFullBins',d.histogramCorrelationFullBins,'defined','']);line(['histogramCorrelationBinDivisor',d.histogramCorrelationBinDivisor,'defined','']);}
  }else if(result.operation==='jpeg.recompression'){
   line(['jpeg_quality','mean_absolute_pixel_error_0_255']);for(let i=0;i<result.data.qualities.length;i++)line([result.data.qualities[i],result.data.raw[i]]);
  }else if(result.operation==='jpeg.quality'){
   line(['quality','mean_absolute_error','normalized_loss']);for(let i=0;i<100;i++)line([i+1,result.data.raw[i],result.data.curve[i]]);
  }else if(result.operation==='inspection.histogram'){
   line(['level','red','green','blue','value']);const b=result.data.bins;
   for(let i=0;i<256;i++)line([i,b[i],b[256+i],b[512+i],b[768+i]]);
  }else throw new EngineError('UNSUPPORTED_EXPORT','CSV export unavailable for this operation.');
  text=lines.join('');mime='text/csv';
 }else throw new EngineError('UNSUPPORTED_EXPORT','Unknown export format.');
 const bytes=new TextEncoder().encode(text);
 if(bytes.byteLength>maxBytes)throw new EngineError('MEMORY_LIMIT','Export exceeds its byte budget.');
 return {mime,bytes};
}
