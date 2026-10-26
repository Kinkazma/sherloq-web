// Generated extension adapter: zoom is relative to the displayed image, minimum +1%.
import {validateLoupeSettings as validateSharedLoupeSettings,loupeDefaults} from './media-settings.js?v=0.25.0';
export {loupeDefaults} from './media-settings.js?v=0.25.0';
// Export preferences remain independent of the PDF zoom convention.
export const exportDefaults=Object.freeze({format:'webp',quality:90,webpQuality:90,heicQuality:90,webpLossless:true,avifLossless:false,heicLossless:false,pngCompression:6,tiffCompression:'deflate',chroma:'source',resize:false,width:0,height:0,resizeAxis:'width',resizeAlgorithm:'auto'});
const object=value=>value&&typeof value==='object'&&!Array.isArray(value);
function integer(value,min,max,name){if(!Number.isInteger(value)||value<min||value>max)throw Error('Invalid '+name);return value;}
export function validateExportSettings(input={}){
 if(!object(input))throw Error('Invalid export settings');const v={...exportDefaults,...input};
 // Preserve an old TIFF zero-compression preference without carrying PNG
 // levels into the new independent TIFF selector.
 if(input.format==='tiff'&&input.tiffCompression===undefined&&input.pngCompression===0)v.tiffCompression='none';
 if(!['png','webp','avif','heic','tiff'].includes(v.format)||!['source','422','444','420'].includes(v.chroma))throw Error('Invalid export format or chroma');
 for(const key of ['quality','webpQuality','heicQuality'])integer(v[key],1,100,key);
 integer(v.pngCompression,0,9,'PNG compression');for(const key of ['width','height'])integer(v[key],0,65500,key);
 if(!['none','deflate'].includes(v.tiffCompression))throw Error('Invalid TIFF compression');
 for(const key of ['resize','webpLossless','avifLossless','heicLossless'])if(typeof v[key]!=='boolean')throw Error('Invalid '+key);
 if(!['width','height'].includes(v.resizeAxis)||!['auto','lanczos3','area','nearest'].includes(v.resizeAlgorithm))throw Error('Invalid resize settings');
 return Object.fromEntries(Object.keys(exportDefaults).map(k=>[k,v[k]]));
}
export function linkedExportSize(settings,source,axis=settings.resizeAxis,value=settings[axis]){
 if(!source?.width||!source?.height)return {width:settings.width,height:settings.height};
 const n=Math.min(65500,Math.max(1,Math.round(value||source[axis]))),ratio=source.width/source.height;
 return axis==='width'?{width:n,height:Math.max(1,Math.round(n/ratio))}:{height:n,width:Math.max(1,Math.round(n*ratio))};
}
// Share every loupe preference with images; only the PDF zoom floor differs.
export function validateLoupeSettings(input={}){
 const value=validateSharedLoupeSettings(input);
 if(value.zoom<101)throw Error('Invalid magnifier zoom');
 return value;
}
export function loupeGeometry(settings,screen=globalThis.screen){
 const short=Math.min(Number(screen?.width)||2056,Number(screen?.height)||1329),factor=settings.proportional?short/1329:1;
 return{diameter:settings.diameter*factor,transition:settings.transition*factor,factor};
}
export function validateMediaPreferences(input={}){
 if(!object(input))throw Error('Invalid media preferences');
 const font=input.font??'iowan';if(!['iowan','montserrat'].includes(font))throw Error('Invalid interface font');
 return{font,exports:validateExportSettings(input.exports),quickExport:validateExportSettings(input.quickExport),loupe:validateLoupeSettings(input.loupe)};
}
export function typingEvent(event){return (event.composedPath?.()??[event.target]).some(e=>['INPUT','TEXTAREA','SELECT'].includes(e?.tagName)||e?.isContentEditable||e?.getAttribute?.('contenteditable')==='true');}
export function loupeSettingsKey(event){return shortcutKey(event,'r');}
export function loupeSweepKey(event){return shortcutKey(event,'b')||!event.defaultPrevented&&!event.repeat&&!event.ctrlKey&&!event.metaKey&&!event.altKey&&!event.isComposing&&event.key?.toLowerCase()==='b'&&(event.composedPath?.()??[event.target]).some(e=>e?.type==='range');}
function shortcutKey(event,key){return !event.defaultPrevented&&!event.repeat&&!event.ctrlKey&&!event.metaKey&&!event.altKey&&!event.isComposing&&event.key?.toLowerCase()===key&&!typingEvent(event);}
export function loupeKey(event){return !event.defaultPrevented&&!event.repeat&&!event.ctrlKey&&!event.metaKey&&!event.altKey&&!event.isComposing&&event.key?.toLowerCase()==='l'&&!typingEvent(event);}
export function loupeMinimumZoom(){return 101;}
export function loupeScale(settings,fit,enhanced=false){return fit*Math.min(3600,Math.max(101,settings.zoom))/100;}
export function resolveChroma(preference,original){return preference==='source'?(['420','422','444'].includes(original)?original:'422'):preference;}
export const imageAccept='image/*,.jpg,.jpeg,.png,.tif,.tiff,.jp2,.j2k,.jpx,.avif,.webp,.heic,.heif,.bmp,.gif,.jxl,.psd,.ico,.ppm,.pgm,.pnm,.tga,.dng,.cr2,.cr3,.nef,.arw,.orf,.rw2';
