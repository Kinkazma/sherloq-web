import "../../runtime-context.js?v=0.14.5";
// Decode only image coders. No filenames, URLs, documents or delegate commands
// are accepted by the extended codec bridge.
const ascii=(b,a,n)=>String.fromCharCode(...b.subarray(a,a+n));
export const isCameraRaw=name=>/\.(dng|cr2|cr3|nef|arw|orf|rw2|raf|pef)$/i.test(String(name??''));
export function extendedImageFormat(bytes,name=''){
 const s=ascii(bytes,0,12),ext=String(name).split('.').pop().toLowerCase();
 if(s.startsWith('RIFF')&&s.slice(8)==='WEBP')return 'WEBP';
 if(s.slice(4,8)==='ftyp'){const brands=ascii(bytes,8,Math.min(56,bytes.length-8));if(/avif|avis/.test(brands))return 'AVIF';if(/heic|heix|hevc|hevx|mif1|msf1/.test(brands))return 'HEIC';}
 if(bytes[0]===0&&bytes[1]===0&&bytes[2]===0&&bytes[3]===12&&s.slice(4,8)==='jP  ')return 'JP2';
 if(bytes[0]===255&&bytes[1]===79&&bytes[2]===255&&bytes[3]===81)return 'J2K';
 if(s.startsWith('GIF8'))return 'GIF';if(s.startsWith('BM'))return 'BMP';if(s.startsWith('8BPS'))return 'PSD';
 if(bytes[0]===0&&bytes[1]===0&&bytes[2]===1&&bytes[3]===0)return 'ICO';
 if(/^P[1-7]\s/.test(s))return 'PNM';if(bytes[0]===255&&bytes[1]===10||s.slice(4,8)==='JXL ')return 'JXL';
 if(['dng','cr2','cr3','nef','arw','orf','rw2','raf','pef'].includes(ext))return ext.toUpperCase();
 if(ext==='tga')return 'TGA';return null;
}
export function isoChroma(bytes){
 // Only accept a single consistent codec sampling declaration. Multiple images
 // with different sampling remain unknown and use the explicit 4:2:2 fallback.
 const values=new Set();const scan=(start,end,depth)=>{if(depth>8)return;for(let at=start;at+8<=end;){let size=new DataView(bytes.buffer,bytes.byteOffset+at,4).getUint32(0),header=8;const tag=ascii(bytes,at+4,4);if(size===1){if(at+16>end)return;size=Number(new DataView(bytes.buffer,bytes.byteOffset+at+8,8).getBigUint64(0));header=16;}if(size===0)size=end-at;if(!Number.isSafeInteger(size)||size<header||at+size>end)return;const body=at+header;
  if(tag==='av1C'&&size>=header+4){const bits=bytes[body+2];if(!(bits&16))values.add(bits&8?bits&4?'420':'422':'444');}
  if(tag==='hvcC'&&size>=header+17){const value=bytes[body+16]&3;if(value)values.add(['','420','422','444'][value]);}
  if(['meta','iprp','ipco'].includes(tag))scan(body+(tag==='meta'?4:0),at+size,depth+1);at+=size;
 }};scan(0,bytes.length,0);return values.size===1?[...values][0]:null;
}
export function webpChroma(bytes){
 // VP8X may precede ICC/alpha and the actual image bitstream.
 if(ascii(bytes,0,4)!=='RIFF'||ascii(bytes,8,4)!=='WEBP')return null;
 for(let at=12;at+8<=bytes.length;){const tag=ascii(bytes,at,4),size=new DataView(bytes.buffer,bytes.byteOffset+at+4,4).getUint32(0,true);
  if(size>bytes.length-at-8)return null;if(tag==='VP8L')return '444';if(tag==='VP8 ')return '420';at+=8+size+(size&1);
 }return null;
}
