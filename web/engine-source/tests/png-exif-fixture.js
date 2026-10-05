export async function checkPngExif(engine,load,sha,ref){
 let cases=0;
 for(const row of ref.cases){
  const bytes=await load(row.file);await engine.load({id:'i',bytes});
  const structure=await engine.run({id:'s',imageId:'i',operation:'metadata.structure'}),location=await engine.run({id:'l',imageId:'i',operation:'metadata.location'}),thumbnail=await engine.run({id:'t',imageId:'i',operation:'metadata.thumbnail'});
  const same=(a,b,name)=>{if(a!==b)throw Error(row.file+': '+name+' mismatch');};
  same(structure.data.exif.directories.length,3,'directories');same(location.data.coordinates.latitude,row.latitude,'latitude');same(location.data.coordinates.longitude,row.longitude,'longitude');same(location.data.networkRequested,false,'network');
  same(thumbnail.data.sourceOffset,row.thumbnailOffset,'offset');same(thumbnail.data.sourceLength,row.thumbnailLength,'length');same(await sha(thumbnail.data.bytes),row.thumbnailSha256,'thumbnail bytes');same(await sha(thumbnail.pixels.data),row.resizedSha256,'native resize');same(await sha(thumbnail.data.difference.data),row.differenceSha256,'native difference');
  await engine.unload('i');cases++;
 }
 return {status:'passed',cases,exactNativeThumbnail:true,gpsAndDirectories:true,exifBeforeAndAfterIdat:true};
}
