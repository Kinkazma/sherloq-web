import {effectDefaults,validateLoupeEffects} from './loupe-effects-settings.js';
// Stored locally when possible and included in portable workspace settings.
export const exportDefaults=Object.freeze({format:'webp',quality:90,webpQuality:90,heicQuality:90,webpLossless:true,avifLossless:false,heicLossless:false,pngCompression:6,chroma:'source',resize:false,width:0,height:0,resizeAxis:'width',resizeAlgorithm:'auto'});
export const loupeDefaults=Object.freeze({enabled:false,diameter:300,transition:60,proportional:true,zoom:200,unlock:false,markers:true,ringStyle:'dashed',ringWidth:1,ringOpacity:100,ringColor:'#edf6dc',sweepTarget:'gamma',sweepSpeed:2,effects:effectDefaults});
const object=value=>value&&typeof value==='object'&&!Array.isArray(value);
function integer(value,min,max,name){if(!Number.isInteger(value)||value<min||value>max)throw Error('Invalid '+name);return value;}
export function validateExportSettings(input={}){
 if(!object(input))throw Error('Invalid export settings');const v={...exportDefaults,...input};
 if(!['png','webp','avif','heic','tiff'].includes(v.format)||!['source','422','444','420'].includes(v.chroma))throw Error('Invalid export format or chroma');
 for(const key of ['quality','webpQuality','heicQuality'])integer(v[key],1,100,key);
 integer(v.pngCompression,0,9,'PNG compression');for(const key of ['width','height'])integer(v[key],0,65500,key);
 for(const key of ['resize','webpLossless','avifLossless','heicLossless'])if(typeof v[key]!=='boolean')throw Error('Invalid '+key);
 if(!['width','height'].includes(v.resizeAxis)||!['auto','lanczos3','area','nearest'].includes(v.resizeAlgorithm))throw Error('Invalid resize settings');
 return Object.fromEntries(Object.keys(exportDefaults).map(k=>[k,v[k]]));
}
export function linkedExportSize(settings,source,axis=settings.resizeAxis,value=settings[axis]){
 if(!source?.width||!source?.height)return {width:settings.width,height:settings.height};
 const n=Math.min(65500,Math.max(1,Math.round(value||source[axis]))),ratio=source.width/source.height;
 return axis==='width'?{width:n,height:Math.max(1,Math.round(n/ratio))}:{height:n,width:Math.max(1,Math.round(n*ratio))};
}
export function validateLoupeSettings(input={}){
 if(!object(input))throw Error('Invalid magnifier settings');const v={...loupeDefaults,...input};
 // Upgrade the old 100/30 default without overwriting a user's custom size.
 if(input.proportional===undefined&&input.diameter===100&&input.transition===30){v.diameter=300;v.transition=60;}
 for(const [key,min,max]of [['sweepSpeed',.1,5],['diameter',10,2000],['transition',0,1000],['zoom',2,3600],['ringWidth',.5,5],['ringOpacity',10,100]])if(!Number.isFinite(v[key])||v[key]<min||v[key]>max)throw Error('Invalid magnifier '+key);
 for(const key of ['enabled','unlock','markers','proportional'])if(typeof v[key]!=='boolean')throw Error('Invalid '+key);
 if(!['solid','dashed'].includes(v.ringStyle)||!/^#[a-f\d]{6}$/i.test(v.ringColor))throw Error('Invalid magnifier rings');
 if(v.sweepTarget==='enabled'||!Object.hasOwn(effectDefaults.adjust,v.sweepTarget))throw Error('Invalid magnifier sweep target');
 v.effects=validateLoupeEffects(v.effects);
 return Object.fromEntries(Object.keys(loupeDefaults).map(k=>[k,v[k]]));
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
export function loupeMinimumZoom(settings,fit,enhanced=false){return enhanced?Math.min(3600,Math.max(2,Math.round(fit*100)+1)):settings.unlock?2:Math.min(3600,Math.max(2,fit*100));}
export function loupeScale(settings,fit,enhanced=false){return Math.min(3600,Math.max(loupeMinimumZoom(settings,fit,enhanced),settings.zoom))/100;}
export function resolveChroma(preference,original){return preference==='source'?(['420','422','444'].includes(original)?original:'422'):preference;}
export const imageAccept='image/*,.jpg,.jpeg,.png,.tif,.tiff,.jp2,.j2k,.jpx,.avif,.webp,.heic,.heif,.bmp,.gif,.jxl,.psd,.ico,.ppm,.pgm,.pnm,.tga,.dng,.cr2,.cr3,.nef,.arw,.orf,.rw2';
