// Source content, its decoded container and consumer precision are distinct.
// This module reads only qualified metadata: no pixel scans, extension guesses,
// codec imports, tensor-type inference or new source allocation.
const depth=value=>Number.isInteger(value)&&value>0&&value<=64?value:null;
const firstDepth=(...values)=>values.map(depth).find(value=>value!==null)??null;
const floatType=value=>['float16','float32','float64'].includes(value);
export function describeSourcePrecision({header={},provenance={},nativeSurface}={}){
 const color=header.nativeColor??provenance.sourceColor??provenance.nativeColor??nativeSurface?.color??{},conversion=provenance.sdrConversion;
 const codedDepth=firstDepth(header.codedDepth,header.sourceDepth,header.sourceBitDepth,provenance.codedDepth,provenance.sourceDepth,provenance.sourceBitDepth,nativeSurface?.sourceDepth);
 const declaredType=header.sourceSampleType??provenance.sourceSampleType;
 const codedType=floatType(declaredType)?declaredType:['uint8','uint16','uint32','unsigned-integer'].includes(declaredType)?'unsigned-integer':'unknown';
 const native16=nativeSurface?.format==='rgb16'&&nativeSurface.depth===16;
 const cicp=header.cicp??provenance.cicp,transfer=typeof color.transfer==='string'?color.transfer.toLowerCase():null,transferCode=Array.isArray(cicp)?cicp[1]:typeof cicp==='string'?Number(cicp.split(/[\/,]/)[1]):null;
 const gainMap=header.gainMap===true||header.gainMap?.present===true||provenance.gainMap===true||conversion?.gainMapPresent===true;
 const gainInfo=header.gainMapContent??provenance.gainMapContent,baseHeadroom=Number.isFinite(gainInfo?.baseHeadroom)?gainInfo.baseHeadroom:Number.isFinite(header.baseHeadroom)?header.baseHeadroom:null;
 const imageRole=header.nativeImageRole??provenance.nativeImageRole??'decoded-image';
 // A presentation fallback or a gain-map alternate is not the primary bank.
 const hdr=header.hdr===true||provenance.hdr===true||['pq','hlg'].includes(transfer)||[16,18].includes(transferCode)||gainMap&&baseHeadroom>0||imageRole!=='primary'&&conversion?.needsToneMapping===true;
 const alphaInput=header.sourceAlpha??provenance.sourceAlpha;
 const alphaPresent=alphaInput?.present===true||header.alpha===true;
 const alpha={present:alphaPresent,depth:alphaPresent?firstDepth(alphaInput?.depth,header.alphaDepth):null,association:alphaPresent?alphaInput?.association??'unknown':null,nativeRepresentation:alphaPresent?alphaInput?.nativeRepresentation??null:null,displayRepresentation:alphaPresent?alphaInput?.displayRepresentation??null:null};
 const distinctAlpha=alphaPresent&&alpha.nativeRepresentation==='straight-rgb'&&alpha.displayRepresentation==='composited-rgb';
 const reasons=[];if(codedDepth!==null&&codedDepth>8)reasons.push('coded-depth-above8');if(floatType(codedType))reasons.push('floating-source');if(hdr)reasons.push('hdr-source-domain');if(distinctAlpha)reasons.push('straight-alpha-source-domain');
 const rich=reasons.length>0,defaultWorkingDepth=native16&&rich?16:8;
 const sourceModel=color.sourceModel??provenance.sourceColorSpace??null,raw=sourceModel==='camera-raw',cmyk=sourceModel==='CMYK',gray=sourceModel==='GRAY';
 const role=!native16?'presentation':raw?'developed':cmyk?'color-converted':'decoded';
 const representation=!native16?'sdr-rgb-presentation':raw?'developed-rgb':cmyk?'color-converted-rgb':gray?'expanded-gray-code-values':'decoded-rgb-code-values';
 const gainMapContent=gainMap?{availability:gainInfo?.availability??'not-declared',decodedSurface:gainInfo?.decodedSurface===true,baseHeadroom,alternateHeadroom:Number.isFinite(gainInfo?.alternateHeadroom)?gainInfo.alternateHeadroom:Number.isFinite(header.alternateHeadroom)?header.alternateHeadroom:null,alternateReconstruction:gainInfo?.alternateReconstruction??'not-declared'}:null;
 return{schema:'sherloq.source-precision/1',coded:{sampleType:codedType,depth:codedDepth},decoded:{sampleType:native16?'uint16':'uint8',containerBits:native16?16:8,domain:'decoded',role,sourceModel,representation,imageRole,gainMapApplied:header.nativeGainMapApplied===true||provenance.nativeGainMapApplied===true,promotion:header.samplePromotion??provenance.samplePromotion??null,transformations:raw?['raw-development']:cmyk?[color.iccAppliedToNative?'icc-to-working-rgb':'cmyk-to-working-rgb']:[]},hdr,gainMap,gainMapContent,alpha,defaultWorkingDepth,reasons:rich?reasons:[codedDepth===8?'coded8-sdr':'no-qualified-richer-domain'],nativeDecodedSamplesRetained:native16,consumerConversion:'per-operation-declared-capability'};
}
export function sourceDefaultWorkingDepth(input){
 const precision=input?.sourcePrecision??input?.precisionCapabilities?.sourcePrecision;
 if(precision?.schema==='sherloq.source-precision/1'&&[8,16].includes(precision.defaultWorkingDepth))return precision.defaultWorkingDepth;
 // Older descriptors need the same metadata decision, not a container=16 rule.
 return describeSourcePrecision({header:input??{},provenance:input?.provenance??{},nativeSurface:input?.nativeSurface}).defaultWorkingDepth;
}
