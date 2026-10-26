/** Complete resident alternatives for the three qualified single-thread native
 * adapters. These are admission bounds, never altered scientific parameters.
 * Unknown/dynamic/parallel adapters return null and retire the optional cache.
 */
export function externalPreviewNativeHeadroom(operation,image,params,{runtimeBytes=0}={}){
 const d=image?.surface?.descriptor;if(!d||![runtimeBytes,d.width,d.height].every(Number.isSafeInteger)||runtimeBytes<0||d.width<1||d.height<1)return null;
 const io=image.session?.backend==='indexeddb'||!image.session&&image.ensureTemporarySession?2*1024**2:0;
 let bytes;
 if(operation==='various.illuminant'){
  const w=d.width,h=d.height,n=w*h;if(!Number.isSafeInteger(params?.block)||params.block<1)return null;const cols=Math.ceil(w/params.block),rows=Math.ceil(h/params.block),cells=cols*rows,dataBytes=cells*41+24,overhead=dataBytes*3+cells*3+cols*3072+cols*4+6144+io+Math.max(w,h)*3+32768,group=Math.min(h,Math.max(1,Math.floor(262144/w)));
  // RGB result, complete native cell analysis, row staging plus source/I/O copy.
  bytes=runtimeBytes+n*3+Math.max(overhead+w*6,overhead+group*w*9)+65536;
 }else if(operation==='colors.stats'||operation==='noise.planes'){
  const w=d.sourceWidth,h=d.sourceHeight,n=w*h,chunk=image.store?.chunkBytes;
  if(![w,h,n,chunk].every(Number.isSafeInteger)||w<1||h<1||chunk<3||image.store.byteLength!==n*3)return null;
  if(operation==='colors.stats')bytes=runtimeBytes+n*3+Math.max(Math.min(n*6,8*1024**2)+io,Math.min(chunk,n*3)*2+io)+65536;
  else{const rows=Math.min(h,Math.max(1,Math.floor(4*1024**2/(w*4))-2)),display=Math.min(h,rows+2)*w*4;bytes=runtimeBytes+n*4+Math.max(Math.min(8*1024**2,n*4+w*8)+io,Math.ceil(Math.min(chunk,n*3)/3)*4+io,display+io)+65536;}
 }else return null;
 return Number.isSafeInteger(bytes)&&bytes>0?{bytes,operation,completeResidentAlternative:true,parallelWorkers:0}:null;
}
