/** Automatic startup only. Explicit Calculate still uses the scientific engine
 * validator, and the chosen JPEG method is never changed by this helper. */
export async function jpegDctAutomaticPreflight({operation,file,isRestricted,isCurrent=()=>true}={}){
 if(!isCurrent())return{allowed:false,obsolete:true};
 if(operation!=='jpeg.multiple')return{allowed:true};
 if(typeof file?.slice!=='function'||typeof isRestricted!=='function')return{allowed:false,reason:'source-unavailable'};
 let header;try{header=new Uint8Array(await file.slice(0,3).arrayBuffer());}catch{if(!isCurrent())return{allowed:false,obsolete:true};return{allowed:false,reason:'source-unavailable'};}
 if(!isCurrent())return{allowed:false,obsolete:true};
 if(header.length!==3||header[0]!==0xff||header[1]!==0xd8||header[2]!==0xff)return{allowed:false,reason:'original-jpeg-required'};
 const restricted=await isRestricted();if(!isCurrent())return{allowed:false,obsolete:true};
 return restricted?{allowed:false,reason:'whole-original-required'}:{allowed:true};
}

/** Explain an original-format refusal without changing the selected method or
 * rewriting its input. Other codec and operation errors keep their diagnostics. */
export function jpegDctFormatNotice(error,{operation,language='fr'}={}){
 if(operation!=='jpeg.multiple'||error?.code!=='UNSUPPORTED_FORMAT'||error?.message!=='JPEG signature required.')return null;
 return language==='en'?'DCT coefficients require an original JPEG file. This image is not encoded as JPEG. Choose “Recompression curve — 101 qualities” to examine its recompression response.':'Les coefficients DCT nécessitent un fichier JPEG original. Cette image n’est pas encodée en JPEG. Choisissez « Courbe de recompression — 101 qualités » pour examiner sa réponse à la recompression.';
}
