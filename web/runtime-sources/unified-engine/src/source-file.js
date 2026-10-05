import {requireValue} from './errors.js';

// Browser File properties are supplied metadata; they are not POSIX stat data.
export function sourceFileInfo(input){
 const name=input.name??input.blob?.name??null,mime=input.mime??input.blob?.type??null,lastModified=input.lastModified??input.blob?.lastModified??null;
 requireValue(name===null||typeof name==='string'&&name.length<=4096&&!/[\\/\0]/.test(name),'Source name must be a basename of at most4096 characters');
 requireValue(mime===null||typeof mime==='string'&&mime.length<=255,'Invalid declared MIME type');
 requireValue(lastModified===null||Number.isSafeInteger(lastModified)&&Math.abs(lastModified)<=8640000000000000,'Invalid source modification time');
 return Object.freeze({name,declaredMimeType:mime||null,lastModified,origin:input.name!==undefined||input.lastModified!==undefined||input.mime!==undefined?'caller':name!==null?'browser-file':null});
}

// Python re.IGNORECASE also folds long-s and dotted/dotless I in these literals.
// Python's $ accepts one trailing LF, but not a trailing CR or other separator.
const hints=[
 ['D[Ssſ]CN[0-9]{4}','Nikon Coolpix camera'],
 ['D[Ssſ]C_[0-9]{4}','Nikon digital camera'],
 ['FUJ[iIİı][0-9]{4}','Fujifilm digital camera'],
 ['[iIİı]MG_[0-9]{4}','Canon DSLR or iPhone camera'],
 ['P[iIİı]C[0-9]{5}','Olympus D-600L camera']
].map(([pattern,hint])=>[new RegExp('^'+pattern+'\\.JPG\\n?(?![\\s\\S])','i'),hint]);
export function filenameBallistics(name){
 requireValue(typeof name==='string','Filename required');
 return hints.find(([pattern])=>pattern.test(name))?.[1]??'Unknown source or manually renamed';
}
export function signatureMime(bytes){
 if(bytes[0]===255&&bytes[1]===216)return 'image/jpeg';
 if(bytes.length>=8&&[137,80,78,71,13,10,26,10].every((v,i)=>bytes[i]===v))return 'image/png';
 if(bytes.length>=4&&(bytes[0]===73&&bytes[1]===73&&[42,43].includes(bytes[2])&&bytes[3]===0||bytes[0]===77&&bytes[1]===77&&bytes[2]===0&&[42,43].includes(bytes[3])))return 'image/tiff';
 return null;
}
