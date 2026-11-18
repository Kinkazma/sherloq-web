import {RECOMPRESSION_FORMATS,validateRecompressionOptions} from './unified-engine/src/recompression-plan.js';

// The codec registry owns availability. This module only translates its entries
// into the existing controls; each choice means one encoding of the original.
export const VALIDATED_RECOMPRESSION_CHOICES=Object.freeze(['jpeg','webp','avif','heic','png','jp2','jxl','gif']);
const format = id => RECOMPRESSION_FORMATS.find(value=>value.id===id);
const equivalentChoice=Object.freeze({bmp:'png',j2k:'jp2'});
const sourceAliases=Object.freeze({jpg:'jpeg',jpe:'jpeg','pjpeg':'jpeg',heif:'heic',hevc:'heic',png8:'png',png24:'png',png32:'png',bmp2:'bmp',bmp3:'bmp',dib:'bmp',tif:'tiff',j2k:'jp2',jpc:'jp2',j2c:'jp2',jpeg2000:'jp2','jpeg-2000':'jp2','jpeg-xl':'jxl',jpegxl:'jxl',gif87:'gif',targa:'tga',icon:'ico','x-icon':'ico','vnd.microsoft.icon':'ico',pnm:'ppm','x-portable-pixmap':'ppm','x-portable-anymap':'ppm','x-portable-arbitrarymap':'pam','vnd.adobe.photoshop':'psd',openexr:'exr','x-exr':'exr','x-pcx':'pcx','x-tga':'tga','x-targa':'tga'});
export function normalizeRecompressionSourceFormat(value){
 if(typeof value!=='string')return null;
 const id=value.trim().toLowerCase().replace(/^image\//,'');
 return !id||['unknown','application/octet-stream'].includes(id)?null:sourceAliases[id]??id;
}
export const validRecompressionSettings=value=>{
 const p=validateRecompressionOptions(value);if(!p)return undefined;
 const codec=equivalentChoice[p.codec]??p.codec;if(codec!=='source'&&!VALIDATED_RECOMPRESSION_CHOICES.includes(codec))return undefined;
 return validateRecompressionOptions({...p,codec,lossless:false});
};

export function recompressionChoices({none=false,language='fr',purpose='ela',sourceFormat}={}) {
 const fr=language==='fr',choices=[];
 if(none)choices.push({value:'none',label:fr?'Aucune':'None'});
 const source=normalizeRecompressionSourceFormat(sourceFormat),sourceCodec=format(source),sourceAvailable=VALIDATED_RECOMPRESSION_CHOICES.includes(source)&&sourceCodec?.lossy;
 // Once the input is known its family has one menu row. Saved `source`
 // recipes retain their dynamic meaning, but select that existing row.
 if(!source)choices.push({value:'source',label:fr?'Format source':'Source format'});
 else if(!sourceAvailable)choices.push({value:'source',label:`${sourceCodec?.label??source.toUpperCase()} (${fr?'format source — indisponible':'source format — unavailable'})`,disabled:true,title:fr?'Ce format source ne possède pas de recompression avec perte dans cette liste.':'This source format has no lossy recompression in this list.'});
 for(const entry of RECOMPRESSION_FORMATS){
  if(!VALIDATED_RECOMPRESSION_CHOICES.includes(entry.id))continue;
  if(purpose==='ela'&&!entry.lossy)continue;
  if(entry.lossy||entry.lossless){const label=entry.id==='jp2'?'JPEG 2000':entry.lossyLabel??entry.label??entry.id.toUpperCase();choices.push({value:entry.id,label:label+(entry.id===source?` (${fr?'format source':'source format'})`:'')});}
 }
 return choices.map(choice=>{
  const codec=choice.value.split(':')[0],mismatch=!!source&&!['none','source'].includes(codec)&&normalizeRecompressionSourceFormat(codec)!==source;
  return {...choice,mismatch,label:(mismatch?'⚠️ ':'')+choice.label,...(mismatch?{title:fr?'Format de recompression différent du fichier original.':'Recompression format differs from the original file.'}:{})};
 });
}
export function recompressionMenuValue(value,sourceFormat){
 const source=normalizeRecompressionSourceFormat(sourceFormat);
 return value==='source'&&VALIDATED_RECOMPRESSION_CHOICES.includes(source)?source:value;
}
export function recompressionChoice(value,fallback='jpeg') {
 if(value===undefined)return fallback;
 const p=validRecompressionSettings(value);if(!p)return fallback;const entry=format(p.codec);
 return p.codec+(p.lossless&&entry?.lossy?':lossless':'');
}
export function recompressionFromChoice(value,{quality}={}) {
 if(value==='none')return undefined;
 const [codec,mode]=value.split(':'),entry=format(codec);
 return validRecompressionSettings({codec,lossless:mode==='lossless'||!!entry&&!entry.lossy,...(quality!==undefined?{quality}:{})});
}
export function recompressionUsesQuality(value,{sourceFormat}={}) {
 if(value==='none')return false;
 let [codec,mode]=value.split(':');if(codec==='source')codec=normalizeRecompressionSourceFormat(sourceFormat)??codec;
 return mode!=='lossless'&&(codec==='source'||!!format(codec)?.qualityMeaningful);
}
export function fillRecompressionChoices(select,{none=false,language='fr',purpose='ela',value=select.value,sourceFormat}={}) {
 const document=select.ownerDocument;select.replaceChildren();
 for(const choice of recompressionChoices({none,language,purpose,sourceFormat})){const option=document.createElement('option');option.value=choice.value;option.textContent=choice.label;option.disabled=choice.disabled===true;if(choice.title)option.title=choice.title;option.dataset.sourceFormatMismatch=String(choice.mismatch);select.append(option);}
 select.value=recompressionMenuValue(value,sourceFormat);
}
// Old trial profiles can contain reversible modes. Keep their chosen family
// when it has a lossy path; ELA menus never restore a lossless variant.
export function elaRecompressionSettings(value){
 if(value===undefined)return undefined;
 const p=validRecompressionSettings(value);
 return p&&(p.codec==='source'||format(p.codec)?.lossy)?{...p,lossless:false}:undefined;
}
export function elaSourceCompressionSupported(codec){const id=normalizeRecompressionSourceFormat(codec);return !id||VALIDATED_RECOMPRESSION_CHOICES.includes(id)&&format(id)?.lossy;}
export function recompressionQualityControl(value,quality,{language='fr',sourceFormat}={}){
 const codec=value==='source'?sourceFormat:value.split(':')[0],entry=format(codec),palette=entry?.qualityKind==='palette-colors'&&!value.endsWith(':lossless'),fr=language==='fr';
 const colors=2+Math.round((quality-1)*254/99);
 return {palette,colors,label:palette?(fr?'Palette %':'Palette %'):(fr?'Qualité':'Quality'),title:palette?(fr?`Palette quantifiée : ${colors} couleurs au maximum. 1 = 2 couleurs ; 100 = 256 couleurs.`:`Quantized palette: at most ${colors} colors. 1 = 2 colors; 100 = 256 colors.`):''};
}
export function recompressionIdentity(params={}) {
 return JSON.stringify([params.quality,params.recompression===undefined?null:validRecompressionSettings(params.recompression)]);
}
// Performance observations belong to the codec family, while cached pixels
// still belong to the exact quality. A slider must not reset adaptation at
// every numerical position.
export function recompressionSizingIdentity(params={}) {
 const value=params.recompression;
 return JSON.stringify([value?.codec??'jpeg',value?.lossless??false]);
}
