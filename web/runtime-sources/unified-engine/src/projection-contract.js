import "../../runtime-context.js?v=0.33.3";
// An explicit presentation policy over the actual decoded source. No colour
// transform, profile invention, alpha compositing or sample-value inference.
import{EngineError,requireValue}from'./errors.js';
const Models=Object.freeze({RGB:['R','G','B'],GRAY:['Y'],CMYK:['C','M','Y','K']});
const bindingKeys=['imageId','sourceSurfaceId','sourceRevision','sourceSha256','kind'];
export const sameBinding=(a,b)=>!!a&&!!b&&bindingKeys.every(key=>a[key]===b[key]);
const exact=(a,b)=>Array.isArray(a)&&Array.isArray(b)&&a.length===b.length&&b.every((n,i)=>n===a[i]);
export const limited=(code,message)=>Object.freeze({status:'limited',code,message,sourceSamplesPreserved:true});
const page=65536,MiB=1024**2;
export function describeProjection({pin,decodedMetadata:m,colorContract:c,admission:a}={}){
 const receipt=pin?.source,d=receipt?.descriptor,g=m?.canonicalGrid,sg=m?.sourceGrid;
 requireValue(typeof pin?.readWindow==='function'&&typeof pin?.retireWindow==='function'&&d?.format==='native-samples'
  &&d.domain==='decoded'&&d.identityStatus==='fixed'&&sameBinding(d.bindingOriginal,receipt.bindingOriginal)
  &&sameBinding(receipt.bindingOriginal,m?.bindingOriginal)&&d.id===receipt.sourceId&&d.revision===receipt.revision
  &&[d.width,d.height].every(n=>Number.isSafeInteger(n)&&n>0)&&Number.isSafeInteger(d.width*d.height*3)
  &&g?.width===d.width&&g?.height===d.height&&sg?.width===d.sourceWidth&&sg?.height===d.sourceHeight&&sg?.orientation===d.orientation
  &&d.sampleType===m.sampleType&&d.channels===m.channels
  &&exact(d.channelMap,m.channelMap??[])&&d.valueEncoding?.units===m.valueEncoding?.units,
 'The projection requires the fixed, actual decoded pin and Read metadata.');
 const model=m.sourceModel,map=Models[model],Type=d.sampleType==='uint16'?Uint16Array:d.sampleType==='float32'?Float32Array:null;
 if(!map||!Type||!exact(d.channelMap,map)&&!exact(d.channelMap,[...map,'A']))return limited('COLOR_CHANNELS_UNQUALIFIED','These native channels have no qualified SDR ICC projection.');
 const alpha=d.channels===map.length+1;
 const alphaAssociation=alpha?(d.sampleSemantics?.decodedAlphaAssociation??m.alphaAssociation??'unknown'):null;
 if(alpha&&c?.alphaPolicy!=='omit-decoded-alpha')return limited('ALPHA_PRESENTATION_UNDECLARED','The caller must explicitly choose to omit alpha from the RGB8 presentation.');
 const cicp=m.color?.cicp,transfer=Array.isArray(cicp)&&cicp.length===4?cicp[1]:cicp?.transferCharacteristics;
 const knownHdr=m.hdr===true||m.color?.hdr===true||[16,18].includes(transfer)
  ||typeof cicp==='string'&&/^\s*\d+\s*,\s*(16|18)\s*,\s*\d+\s*,\s*[01]\s*$/.test(cicp);
 if(knownHdr||c?.dynamicRange==='hdr')return limited('HDR_PROJECTION_UNQUALIFIED','This ICC projection does not define an HDR tone map.');
 const codeView=c?.profile?.kind==='none'&&c?.dynamicRange==='numeric-preview'&&c?.codeViewPolicy==='nominal-interval-clipped';
 if(!codeView&&!['sdr','icc-relative'].includes(c?.dynamicRange))return limited('COLOR_RANGE_UNDECLARED','The caller must explicitly establish an SDR, ICC-relative or unprofiled code-view domain.');
 const floating=Type===Float32Array,declared=m.valueEncoding?.units,
  units=!floating&&declared==='unsigned-code-values-0..65535'?'uint16-code-values':floating&&model!=='CMYK'&&declared==='relative-color-1'?'relative':
   floating&&model==='CMYK'&&declared==='normalized-ink0..1'?'normalized-ink':floating&&model==='CMYK'&&declared==='percent-ink0..100'?'percent-ink':
   codeView&&floating&&model!=='CMYK'&&(declared==null||declared==='unknown')?'nominal-float-0..1':null;
 if(!units||c.inputUnits!==units||!codeView&&floating&&c.extendedPolicy!=='lcms-defined')return limited('COLOR_UNITS_UNQUALIFIED','The caller and Read must agree on the explicit sample units or code interval.');
 const inputFormat=(model==='GRAY'?'gray':model.toLowerCase())+(floating?'Float32':'16'),p=c.profile;
 if(!codeView&&(!p||!['embedded','declared-icc'].includes(p.kind)||!/^[a-f0-9]{64}$/.test(p.sha256??'')))return limited('COLOR_PROFILE_REQUIRED','No exact input ICC profile was selected for this presentation.');
 let profileBytes=0;
 if(!codeView&&p.kind==='embedded'){
  const ref=m.color?.iccProfile;
  if(ref?.sha256!==p.sha256||!Number.isSafeInteger(ref.bytes)||ref.bytes<128)return limited('COLOR_PROFILE_REQUIRED','The selected exact private ICC profile is unavailable.');
  profileBytes=ref.bytes;
 }else if(!codeView){
  if(!(p.bytes instanceof Uint8Array)||p.bytes.length<128)return limited('COLOR_PROFILE_REQUIRED','The declared ICC profile has no admitted bytes.');
  profileBytes=p.bytes.length;
 }
 if(!codeView)requireValue(Number.isInteger(c.intent)&&c.intent>=0&&c.intent<=3&&typeof c.blackPointCompensation==='boolean','Explicit ICC rendering intent and black-point policy are required.');
 const pixelBytes=d.channels*Type.BYTES_PER_ELEMENT,colourPixelBytes=map.length*Type.BYTES_PER_ELEMENT;
 requireValue(a&&Number.isSafeInteger(a.maximumWindowBytes)&&a.maximumWindowBytes>=pixelBytes
  &&(codeView||Number.isSafeInteger(a.colorHeapBytes)&&a.colorHeapBytes>=16*MiB&&a.colorHeapBytes<=2**32&&a.colorHeapBytes%page===0)
  &&Number.isSafeInteger(a.displayBytes)&&a.displayBytes>=0&&['auto','cpu'].includes(a.backend)
  &&Number.isSafeInteger(a.ioHeadroomBytes??0)&&(a.ioHeadroomBytes??0)>=0
  &&['auto','memory','temporary'].includes(a.storage),'An admitted window, CMM/display and storage plan is required.');
 const totalPixels=d.width*d.height,maximumPixels=Math.min(totalPixels,Math.floor(a.maximumWindowBytes/pixelBytes),codeView?Infinity:Math.floor((a.colorHeapBytes/4)/colourPixelBytes));
 const genuineRgb16=!codeView&&!floating&&model==='RGB'&&Number.isInteger(d.sourceDepth)&&d.sourceDepth>8&&d.sourceDepth<=16
  &&d.sampleSemantics?.colorConversionApplied===false&&d.sampleSemantics?.developmentApplied===false;
 return Object.freeze({status:'admitted',receipt,d,model,map,Type,alpha,alphaAssociation,floating,inputFormat,inputUnits:units,profileBytes,profile:Object.freeze({kind:p.kind,sha256:p.sha256}),codeView,
  width:d.width,height:d.height,totalPixels,maximumPixels,maximumColorBandBytes:Math.max(8,maximumPixels*colourPixelBytes),genuineRgb16,
  backend:genuineRgb16?a.backend:'cpu',displayBytes:genuineRgb16&&a.backend==='auto'?a.displayBytes:0,
  colorHeapBytes:a.colorHeapBytes,ioHeadroomBytes:a.ioHeadroomBytes??0,storage:a.storage,dynamicRange:c.dynamicRange,intent:c.intent,blackPointCompensation:c.blackPointCompensation});
}
export function checkIccProfile(bytes,plan){
 const signature=at=>String.fromCharCode(...bytes.subarray(at,at+4)),expected={RGB:'RGB ',GRAY:'GRAY',CMYK:'CMYK'}[plan.model];
 if(!(bytes instanceof Uint8Array)||bytes.length!==plan.profileBytes||bytes.length<128)throw new EngineError('COLOR_PROFILE_REQUIRED','The exact selected ICC payload is unavailable.');
 const length=new DataView(bytes.buffer,bytes.byteOffset,bytes.length).getUint32(0,false);
 if(length<128||length>bytes.length||signature(36)!=='acsp')throw new EngineError('COLOR_PROFILE_INVALID','The selected ICC payload is invalid.');
 if(signature(16)!==expected)throw new EngineError('COLOR_PROFILE_MISMATCH','The ICC profile does not describe the decoded channels.');
}
