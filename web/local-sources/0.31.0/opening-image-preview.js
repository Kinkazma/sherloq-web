// Opening presentation only. Never supplies scientific RGB, hashes or exports.
const HEADER_BYTES=128*1024,ENCODED_BYTES=8*1024**2,MAX_PIXELS=16_000_000,MAX_DECODED_BYTES=64_000_000;
const ascii=(b,p,n)=>String.fromCharCode(...b.subarray(p,p+n));
const u16=(b,p,le=false)=>le?b[p]+256*b[p+1]:256*b[p]+b[p+1];
const u32=(b,p,le=false)=>le?(b[p]+b[p+1]*256+b[p+2]*65536+b[p+3]*16777216):(b[p]*16777216+b[p+1]*65536+b[p+2]*256+b[p+3]);
function orientation(b,start,end){
 if(end-start<8)return 1;const le=ascii(b,start,2)==='II';if(!le&&ascii(b,start,2)!=='MM'||u16(b,start+2,le)!==42)return 1;
 const at=start+u32(b,start+4,le);if(at<start+8||at+2>end)return 1;const count=u16(b,at,le);if(count>256||at+2+12*count>end)return 1;
 for(let i=0;i<count;i++){const p=at+2+12*i;if(u16(b,p,le)===0x112&&u16(b,p+2,le)===3&&u32(b,p+4,le)===1){const value=u16(b,p+8,le);return value>=1&&value<=8?value:1;}}
 return 1;
}
export function openingImageDimensions(bytes,totalBytes=bytes?.byteLength){
 if(!(bytes instanceof Uint8Array)||bytes.length>HEADER_BYTES||!Number.isSafeInteger(totalBytes)||totalBytes<bytes.length)return null;
 const b=bytes;
 if(b.length>=33&&ascii(b,0,8)==='\x89PNG\r\n\x1a\n'){
  if(u32(b,8)!==13||ascii(b,12,4)!=='IHDR')return null;const width=u32(b,16),height=u32(b,20),depth=b[24];let rotate=1;
  if(![1,2,4,8,16].includes(depth))return null;
  for(let p=8;p+8<=b.length;){const n=u32(b,p),kind=ascii(b,p+4,4),end=p+n+12;if(end>totalBytes)return null;if(kind==='acTL')return null;if(kind==='IDAT')return{format:'png',width,height,orientation:rotate,bytesPerPixel:depth===16?8:4};if(end>b.length)return null;if(kind==='eXIf')rotate=orientation(b,p+8,p+8+n);if(kind==='IEND')return null;p=end;}
  return null;
 }
 if(b.length>=4&&b[0]===255&&b[1]===216){
  let size=null,rotate=1;
  for(let p=2;p+1<b.length;){if(b[p++]!==255)return null;while(p<b.length&&b[p]===255)p++;if(p>=b.length)return null;const marker=b[p++];if(marker===0||marker===216||marker===217)return null;if(marker===218)return size?{format:'jpeg',...size,orientation:rotate,bytesPerPixel:4}:null;if(marker===1||marker>=208&&marker<=215)continue;if(p+2>b.length)return null;const n=u16(b,p),end=p+n;if(n<2||end>totalBytes||end>b.length)return null;
   if(marker===225&&n>=8&&ascii(b,p+2,6)==='Exif\0\0')rotate=orientation(b,p+8,end);
   if([192,193,194].includes(marker)){if(n<8||b[p+2]!==8)return null;size={height:u16(b,p+3),width:u16(b,p+5)};}
   else if([195,197,198,199,201,202,203,205,206,207].includes(marker))return null;
   p=end;
  }return null;
 }
 if(b.length>=25&&ascii(b,0,4)==='RIFF'&&ascii(b,8,4)==='WEBP'&&u32(b,4,true)+8===totalBytes){
  const kind=ascii(b,12,4),length=u32(b,16,true);if(length+20>totalBytes)return null;
  if(kind==='VP8 '&&b.length>=30&&length>=10&&!(b[20]&1)&&ascii(b,23,3)==='\x9d\x01\x2a')return{format:'webp',width:u16(b,26,true)&16383,height:u16(b,28,true)&16383,orientation:1,bytesPerPixel:4};
  if(kind==='VP8L'&&length>=5&&b[20]===47){const bits=u32(b,21,true);if(bits>>>29)return null;return{format:'webp',width:(bits&16383)+1,height:((bits>>>14)&16383)+1,orientation:1,bytesPerPixel:4};}
  // Extended/animated WebP metadata is deliberately left to the native decoder.
 }
 return null;
}
export function createOpeningImagePreview({file,document=globalThis.document,isCurrent=()=>true,maxPixels=MAX_PIXELS,signal,urlAPI=globalThis.URL}={}){
 let disposed=false,url=null,probe=null,settled=false,resolveReady;const attachments=new Set(),ready=new Promise(resolve=>resolveReady=resolve);
 const settle=value=>{if(!settled){settled=true;resolveReady(value);}};
 const current=()=>{try{return !disposed&&!signal?.aborted&&isCurrent()===true;}catch{return false;}};
 function remove(image){image.onload=image.onerror=null;try{image.removeAttribute('src');}catch{}try{image.remove();}catch{}}
 function dispose(){if(!disposed){disposed=true;signal?.removeEventListener('abort',dispose);for(const row of attachments){remove(row.image);row.disposed=true;}attachments.clear();if(probe)remove(probe);probe=null;}try{if(url!==null){urlAPI.revokeObjectURL(url);url=null;}}finally{settle(false);}}
 function loaded(image){if(!current()){dispose();return;}if(!Number.isSafeInteger(image.naturalWidth*image.naturalHeight)||image.naturalWidth<1||image.naturalHeight<1||image.naturalWidth*image.naturalHeight>Math.min(MAX_PIXELS,maxPixels)){dispose();return;}settle(true);}
 function image(){const value=document.createElement('img');value.alt='';value.decoding='async';value.draggable=false;value.dataset.openingPreview='true';Object.assign(value.style,{width:'100%',height:'100%',objectFit:'contain',display:'block',pointerEvents:'none',imageOrientation:'from-image'});value.onload=()=>loaded(value);value.onerror=()=>dispose();return value;}
 const owner={ready,attach(parent){if(!current()||typeof parent?.append!=='function')return{dispose(){}};let value;try{value=image();const row={image:value,disposed:false};attachments.add(row);parent.append(value);if(url)value.src=url;return{dispose(){if(row.disposed)return;row.disposed=true;attachments.delete(row);remove(value);}};}catch{if(value)remove(value);dispose();return{dispose(){}};}},dispose};
 if(signal?.aborted){dispose();return owner;}signal?.addEventListener('abort',dispose,{once:true});
 void(async()=>{
  try{
   if(!current()||!file||typeof file.slice!=='function'||!Number.isSafeInteger(file.size)||file.size<1||file.size>ENCODED_BYTES||!Number.isSafeInteger(maxPixels)||maxPixels<1){dispose();return;}
   const buffer=await file.slice(0,Math.min(file.size,HEADER_BYTES)).arrayBuffer();if(!current()){dispose();return;}
   const dimensions=openingImageDimensions(new Uint8Array(buffer),file.size),pixels=dimensions?.width*dimensions?.height;
   if(!dimensions||!Number.isSafeInteger(pixels)||dimensions.width<1||dimensions.height<1||Math.max(dimensions.width,dimensions.height)>32768||pixels>Math.min(MAX_PIXELS,maxPixels)||pixels*dimensions.bytesPerPixel>MAX_DECODED_BYTES){dispose();return;}
   url=urlAPI.createObjectURL(file);if(!current()){dispose();return;}probe=image();probe.src=url;for(const row of attachments)if(!row.disposed)row.image.src=url;
  }catch{try{dispose();}catch{settle(false);}}
 })();
 return owner;
}
