import "../../runtime-context.js?v=0.30.0";
import{createZeroRetirement as createRetirement}from'./zero-native-context-plan.js';
import{checkAbort,requireValue,createCooperator,EngineError}from'./errors.js';
import{jpegHeader}from'./image-headers.js';import{JPEG_ID}from'./jpeg.js';import{readOriginalDctHistograms}from'./double-jpeg-stream.js';
import{createDctBlockPlan,DCT_DOMAIN_VERSION}from'./double-jpeg-domain.js';import{doubleJpegHistogramResult}from'./double-jpeg.js';
export function originalJpegGeometry(image){
 image=image.originalSource??image;
 if(image.bytes instanceof Uint8Array){const h=jpegHeader(image.bytes);return{width:h.sourceWidth,height:h.sourceHeight,orientation:h.orientation};}
 const p=image.provenance;requireValue((p?.format==='jpeg'||p?.decoder===JPEG_ID)&&Array.isArray(p.sourceSize)&&p.sourceSize.length===2&&Number.isInteger(p.orientation),'An original JPEG file and its verified source geometry are required.');return{width:p.sourceSize[0],height:p.sourceSize[1],orientation:p.orientation};
}
export async function computeStoredDoubleJpeg(image,{domain,budget,signal,onProgress,onOwner,sourceSha256=image.sha256,started=performance.now(),onTemporarySession}={}){
 image=image.originalSource??image;checkAbort(signal);const owner=createRetirement({signal});let finish;owner.waitUntil(new Promise(r=>finish=r));let plan,stored,session,failed=false,primary;const child=value=>owner.add(()=>value.dispose(),0),cooperate=createCooperator(owner.signal),source=image.source??{byteLength:image.bytes.length,async read(offset,length,{signal:readSignal}={}){checkAbort(readSignal);return{bytes:image.bytes.subarray(offset,offset+length),release(){}};}};
 owner.add(async()=>{await session?.dispose();session=null;},2);
 try{
  onOwner?.(owner);checkAbort(owner.signal);const shape=originalJpegGeometry(image),planAt=performance.now();plan=await createDctBlockPlan({...shape,sourceSha256,domain,budget,signal:owner.signal,onOwner:child});owner.add(()=>plan.dispose(),0);const planMs=performance.now()-planAt;
  const getTemporarySession=async()=>{if(image.ensureTemporarySession)return image.ensureTemporarySession({signal:owner.signal});if(image.session)return image.session;if(!session){const{createTemporarySession}=await import('./temporary-storage.js');session=await createTemporarySession({budget,signal:owner.signal});onTemporarySession?.({id:session.id,backend:session.backend});}return session;};
  stored=await readOriginalDctHistograms(source,{...shape,plan,budget,signal:owner.signal,getTemporarySession,onOwner:child,onProgress});owner.add(()=>stored.release(),0);checkAbort(owner.signal);const scoreAt=performance.now(),result=await doubleJpegHistogramResult(stored.histograms,{signal:owner.signal,cooperate,onProgress:f=>onProgress?.({phase:'dct-lattice',fraction:f})},{sourceSha256,started});const scoringMs=performance.now()-scoreAt;
  checkAbort(owner.signal);result.engineMetrics={...stored.metrics,planMs,scoringMs,domainVersion:DCT_DOMAIN_VERSION,domainFingerprint:domain?.fingerprint??null,originalEncodedDimensions:[shape.width,shape.height],orientation:shape.orientation,completeSourceBlocks:plan.totalBlocks,selectedSourceBlocks:plan.includedBlocks,excludedParticipation:'absent-before-histogram-counts-and-lattice-statistics',nativeAnalysisCalls:1,gpuJobs:0};if(domain){result.data.source_population={version:DCT_DOMAIN_VERSION,sourceSha256,domainFingerprint:domain.fingerprint,encodedDimensions:[shape.width,shape.height],displayedDimensions:[domain.sourceWidth,domain.sourceHeight],orientation:shape.orientation,completeBlocks:plan.totalBlocks,selectedBlocks:plan.includedBlocks,incompleteEncodedEdgeBlocks:'omitted exactly as native global analysis',coefficientCoordinates:'original-encoded-grid',population:plan.whole?'native-whole':'wholly-admitted-original8x8-blocks'};}
  return result;
 }catch(e){failed=true;primary=e;throw e;}finally{finish();try{await owner.dispose();}catch(e){if(!failed)throw e;}}
}
