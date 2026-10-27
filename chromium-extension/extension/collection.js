import {allJobs,getJob,putJob,deleteJob} from './db.js';
import {fileHash,collectedPDFMetadata} from './collection-metadata.js';
export {fileHash,collectedPDFMetadata} from './collection-metadata.js';
export const collection=async()=> (await allJobs()).filter(job=>job.basket).sort((a,b)=>a.collected-b.collected);
export async function collect(id){
 const job=await getJob(id);if(!job?.blob||job.kind!=='image')throw Error('Le fichier de cette image n’est pas encore disponible.');
 const hash=job.sha256||await fileHash(job.blob),jobs=await collection(),same=jobs.find(v=>v.sha256===hash);
 if(same){const sources=[...(same.sources||[{page:same.sourcePage,url:same.url}]),{page:job.sourcePage,url:job.url,time:job.videoTime,pdfPage:job.pdfPage}].filter((v,i,a)=>a.findIndex(w=>w.page===v.page&&w.url===v.url&&w.time===v.time&&w.pdfPage===v.pdfPage)===i);await putJob({...same,...collectedPDFMetadata(same,job,hash),sources});return same.id;}
 if(jobs.length>=50||jobs.reduce((n,v)=>n+v.blob.size,0)+job.blob.size>512*1024**2)throw Error('Sélection limitée à 50 images et 512 Mio. Retirez des images avant d’en ajouter.');
 const retained={...job,id:'collected-'+crypto.randomUUID(),basket:true,sha256:hash,collected:Date.now(),sources:[{page:job.sourcePage,url:job.url,time:job.videoTime,pdfPage:job.pdfPage}]};await putJob(retained);return retained.id;
}
export async function removeCollected(ids){for(const id of ids){const job=await getJob(id);if(job?.basket)await deleteJob(id);}}
