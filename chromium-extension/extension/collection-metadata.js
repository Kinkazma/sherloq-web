export async function fileHash(blob){return [...new Uint8Array(await crypto.subtle.digest('SHA-256',await blob.arrayBuffer()))].map(v=>v.toString(16).padStart(2,'0')).join('');}
export function collectedPDFMetadata(same,job,hash){
 const digest=value=>typeof value==='string'&&/^[a-f0-9]{64}$/i.test(value),equal=(a,b)=>digest(a)&&digest(b)&&a.toLowerCase()===b.toLowerCase();
 if(same?.kind!=='image'||job?.kind!=='image'||!equal(same.sha256,hash)||digest(job.sha256)&&!equal(job.sha256,hash)||typeof job.sourcePDFId!=='string'||!job.sourcePDFId||job.reason==='pdf-rendered-page'||same.reason==='pdf-rendered-page'||same.width!==job.width||same.height!==job.height)return {};
 const result={sourcePDFId:same.sourcePDFId||job.sourcePDFId};if(typeof job.reason==='string'&&job.reason)result.reason=job.reason;
 const scope=job.pdfSubimageScope;
 if(scope?.schema==='sherloq.pdf-subimages/1'&&scope.width===same.width&&scope.height===same.height&&equal(scope.sourceSha256,hash)&&Array.isArray(scope.subimages)&&scope.subimages.length&&scope.subimages.every(r=>r&&[r.x0,r.y0,r.x1,r.y1].every(Number.isSafeInteger)&&r.x0>=0&&r.y0>=0&&r.x1>r.x0&&r.y1>r.y0&&r.x1<=same.width&&r.y1<=same.height))result.pdfSubimageScope=structuredClone(scope);
 return result;
}
