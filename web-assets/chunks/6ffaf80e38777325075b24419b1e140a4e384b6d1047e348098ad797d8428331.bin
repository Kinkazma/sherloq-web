import {GAUSSIAN_INDEX,GAUSSIAN_WEIGHTS} from './double-jpeg-weights.js';
import {parameters} from './pixel-utils.js';
import {jpegDctHistograms,jpegHistogramWorkspace,JPEG_ID} from './jpeg.js';
import {checkpoint,requireValue} from './errors.js';
import {jpegHeader} from './image-headers.js';
export const doubleJpegParams=(p={})=>parameters(p,{});
export const doubleJpegAdmission=(image,p,bytes)=>{const h=jpegHeader(bytes);return bytes.length*2+h.sourceWidth*h.sourceHeight*10;};
export const DCT_FREQUENCIES=Object.freeze([[0,1],[1,0],[1,1],[0,2],[2,0],[1,2],[2,1],[0,3],[3,0]].map(Object.freeze));
export const DOUBLE_JPEG_LIMITATIONS='Experimental global detector for aligned JPEG grids and sufficiently separated quantization steps. Equal qualities, a coarser last compression, cropping, resampling, small or smooth images can hide traces. Periodic or synthetic content can imitate traces. A detected trace does not establish malicious editing; an inconclusive result does not establish a single compression.';
export function quantizationLattice(q1,q2,bins=256){
 requireValue(Number.isInteger(q1)&&q1>0&&Number.isInteger(q2)&&q2>0&&Number.isInteger(bins)&&bins>0,'Positive integer quantization steps and bins required.');
 const allowed=new Uint8Array(bins+1),last=Math.floor(((bins+1)*q2+q1-1)/q1);for(let level=0;level<=last;level++){const mapped=Math.floor((2*level*q1+q2)/(2*q2));if(mapped<allowed.length)allowed[mapped]=1;}
 if(q2<3){const expanded=new Uint8Array(bins);for(let i=0;i<bins;i++)expanded[i]=+(allowed[i]||(i>0&&allowed[i-1])||allowed[i+1]);return expanded;}return allowed.slice(0,bins);
}
function pairwise(a,start=0,n=a.length){
 if(n<8){let sum=-0;for(let i=0;i<n;i++)sum+=a[start+i];return sum;}
 if(n<=128){const r=Array.from(a.subarray(start,start+8));let i=8;for(;i<n-n%8;i+=8)for(let j=0;j<8;j++)r[j]+=a[start+i+j];let sum=((r[0]+r[1])+(r[2]+r[3]))+((r[4]+r[5])+(r[6]+r[7]));for(;i<n;i++)sum+=a[start+i];return sum;}
 let cut=Math.floor(n/2);cut-=cut%8;return pairwise(a,start,cut)+pairwise(a,start+cut,n-cut);
}
export async function histogramEvidence(h,q2,workspace){
 requireValue(h.length===256&&Number.isInteger(q2)&&q2>=1&&q2<=65535&&Array.from(h).every(x=>Number.isSafeInteger(x)&&x>=0&&x<=0xffffffff),'Expected 256 nonnegative histogram bins and a positive quantization step.');
 const owned=!workspace;workspace??=await jpegHistogramWorkspace();try{
 let best={score:0,candidate_step:null,current_step:q2,samples:0,expected_gap_fraction:null,observed_gap_fraction:null,eligible:false};
 for(let q1=Math.max(3,2*q2);q1<=Math.min(128,8*q2);q1++){
  const allowed=quantizationLattice(q1,q2),minimum=Math.max(3,Math.ceil(q1/q2));let n=0,nonzero=0,gapCount=0;for(let k=minimum;k<=128;k++){n+=h[k];nonzero+=h[k]!==0;if(!allowed[k])gapCount+=h[k];}if(n<1000||nonzero<12)continue;
  const smooth=workspace.smooth(h,GAUSSIAN_WEIGHTS[GAUSSIAN_INDEX[q1+'/'+q2]]),all=smooth.slice(minimum,129),gaps=Float64Array.from(Array.from({length:129-minimum},(_,k)=>minimum+k).filter(k=>!allowed[k]),k=>smooth[k]);
  const expected=pairwise(gaps)/Math.max(1,pairwise(all));if(expected<.25)continue;const observed=gapCount/n,score=Math.max(0,1-observed/expected);
  if(!best.eligible||score>best.score)best={score,candidate_step:q1,current_step:q2,samples:n,eligible:true,expected_gap_fraction:expected,observed_gap_fraction:observed};
 }return best;
 }finally{if(owned)workspace.dispose();}
}
export async function doubleJpeg(image,p,hooks={},context){
 const started=performance.now(),hist=await jpegDctHistograms(context.bytes,hooks),records=[],workspace=await jpegHistogramWorkspace();
 try{
 for(let i=0;i<9;i++){
  await checkpoint(hooks.signal);const offset=4+i*258,q2=hist[offset],histogram=hist.slice(offset+2,offset+258),record={...await histogramEvidence(histogram,q2,workspace),frequency:DCT_FREQUENCIES[i].slice(),histogram,ignored_tail:hist[offset+1]};record.candidate_lattice=record.eligible?quantizationLattice(record.candidate_step,q2):null;records.push(record);hooks.onProgress?.((i+1)/9);
 }
 const votes=records.filter(r=>r.eligible&&r.score>=.8).length,eligible=records.filter(r=>r.eligible).length;
 return {data:{version:'aligned-lattice-v1',verdict:votes>=3?'compatible_traces':'inconclusive',reason:votes>=3?'lattice_depletion':eligible<3?'insufficient_histograms':'no_strong_consensus',supporting_frequencies:votes,eligible_frequencies:eligible,tested_frequencies:9,threshold:.8,required_frequencies:3,source_sha256:context.sourceSha256,dimensions:[hist[0],hist[1]],complete_blocks:hist[2],progressive:!!hist[3],codec:JPEG_ID,records,limitations:DOUBLE_JPEG_LIMITATIONS,seconds:(performance.now()-started)/1000},layers:[],semantics:'Exact original-file luminance DCT histograms; experimental aligned lattice depletion evidence. Score is not a probability, candidate step is not recovered JPEG quality, and the verdict is not an authenticity assessment.'};
 }finally{workspace.dispose();}
}
