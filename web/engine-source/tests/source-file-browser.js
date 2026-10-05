import {createWorkerEngine} from '../src/worker-client.js';
export async function sourceFileBrowserTest(){
 const bytes=new Uint8Array(await(await fetch('/tests/data/recompression-0.png')).arrayBuffer()),stamp=1234567890000,engine=createWorkerEngine();
 try{
  const loaded=await engine.loadBlob({id:'f',blob:new File([bytes],'IMG_1234.JPG',{type:'image/jpeg',lastModified:stamp})});
  const byteResult=await engine.run({id:'bytes',imageId:'f',operation:'file.digest',params:{imageHashes:false}}),visual=await engine.run({id:'pixels',imageId:'f',operation:'file.digest'});
  for(const r of [byteResult,visual]){const f=r.data.physicalFile;if(f.name!=='IMG_1234.JPG'||f.lastModified!==stamp||f.signatureMimeType!=='image/png'||f.declaredMimeType!=='image/jpeg'||f.nameBallistics!=='Canon DSLR or iPhone camera')throw Error('File metadata mismatch');}
  if(loaded.file.origin!=='browser-file'||JSON.stringify(byteResult.data.hashes)!==JSON.stringify(visual.data.hashes))throw Error('Worker transfer/digest mismatch');
  return {status:'passed',filePropertiesPreserved:true,namingHint:'native pattern',declaredMime:'image/jpeg',signatureMime:'image/png',originalByteHashes:10,existingVisualHashes:Object.keys(visual.data.imageHashes).length};
 }finally{engine.dispose();}
}
