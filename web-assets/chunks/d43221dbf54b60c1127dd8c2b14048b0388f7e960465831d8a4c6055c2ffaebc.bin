import "../../runtime-context.js?v=0.30.0";
import {npyHeader} from './npz.js';
import {requireValue} from './errors.js';

// Native fields have context geometry in metadata, not an invented envelope
// shape. This internal numerical export does not add a product UI export.
export function ritaStrictNpzEntries(result){
 const d=result?.data,n=d?.pixelCount;requireValue(d?.metadata?.fragmented===true&&Number.isSafeInteger(n)&&n>0,'Invalid native RITA context export.');
 return ['map','official_mask','labels','logits'].map(key=>{const value=d[key],channels=key==='logits'?4:1;requireValue(value?.elementType==='Float32Array'&&value.length===channels*n&&value.byteLength===channels*n*4&&typeof value.readBytes==='function','Invalid packed native RITA export field.');return{key,value,header:npyHeader('<f4',channels===4?[4,n]:[n]),bytes:value.byteLength,floating:true,segmented:true};});
}
