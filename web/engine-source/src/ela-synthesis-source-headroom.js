import {rgbRecompressionPlan,rgbRecompressionArchivePlan} from './jpeg-rgb-stream.js';
import {globalHistogram100GpuPlan} from './equalization-global-histogram-gpu.js';
import {requireValue} from './errors.js';
const MiB=1024**2;

// A metadata-only upper bound for the maintained segmented JPEG pipeline.
// It includes the series input staging, two historical encoded cache slots,
// bounded native codec/windows, output storage and both permitted GPU paths.
// These are existing owners; the plan does not allocate or select a new engine.
export function segmentedElaSynthesisHeadroom(surface,{backend='auto',histogram100=false}={}){
 const p=rgbRecompressionPlan(surface),a=rgbRecompressionArchivePlan(surface),n=p.width*p.height*3,band=p.rowBytes*p.rows,bandBlocks=Math.ceil(p.width/8)*Math.ceil(p.rows/8)+2*Math.ceil(p.width/16)*Math.ceil(p.rows/16),gpu=backend!=='cpu';
 const sourceBytes=n,outputBytes=n,encodedBytes=2*p.encodedCapacityBytes,codecBytes=p.workingBytes+p.windowAllowance,storageBytes=Math.min(4*MiB,n)+2*MiB,tableBytes=MiB;
 // The non-archive GPU consumes a bounded pair of native RGB bands. This
 // conservative bound includes its persistent pipelines, queue and mapping.
 const gpuBytes=gpu?(a.eligible?a.workingBytes:72*MiB+band*24+bandBlocks*512):0;
 let equalizationBytes=0;
 if(histogram100){const he=gpu?globalHistogram100GpuPlan(p.width,p.height,false):null;equalizationBytes=n+Math.min(4*MiB,n)+2*MiB+256*1024+(he?12*MiB+he.workspaceBytes+he.readHeadroomBytes:0);}
 const bytes=sourceBytes+outputBytes+encodedBytes+codecBytes+storageBytes+tableBytes+gpuBytes+equalizationBytes;
 requireValue(Number.isSafeInteger(bytes),'Safe complete segmented synthesis headroom is required.');
 return{bytes,sourceBytes,outputBytes,encodedBytes,codecBytes,storageBytes,tableBytes,gpuBytes,equalizationBytes,archiveEligible:a.eligible,policy:'maintained-segmented-JPEG-live-set'};
}
