// Web/Local open the document. A page or extracted figure is a view into its
// source PDF, so neither its raster nor an individual child replaces that file.
export function pdfSourceId(job){return job?.kind==='pdf'?job.id:typeof job?.sourcePDFId==='string'&&job.sourcePDFId?job.sourcePDFId:null;}
export function transferSource(job,pdf){
 if(job?.kind==='pdf')return job;
 const id=pdfSourceId(job);
 if(!id&&job?.reason!=='pdf-rendered-page')return job;
 if(!id||!pdf?.blob||pdf.kind!=='pdf'||id!==pdf.id)throw Error('Le PDF d’origine n’est plus disponible. Rouvrez-le avant de l’envoyer.');
 return pdf;
}
export async function transferMetadata(job){
 if(!['image','pdf'].includes(job?.kind)||!(job.blob instanceof Blob)||!job.blob.size||job.blob.size>256*1024**2)throw Error('Fichier indisponible ou trop volumineux.');
 const bytes=new Uint8Array(await job.blob.slice(0,16).arrayBuffer()),ascii=new TextDecoder().decode(bytes);
 let mime=job.blob.type,extension;
 if(ascii.startsWith('%PDF-')){mime='application/pdf';extension='pdf';}
 else if(bytes[0]===137&&ascii.slice(1,4)==='PNG'){mime='image/png';extension='png';}
 else if(bytes[0]===255&&bytes[1]===216&&bytes[2]===255){mime='image/jpeg';extension='jpg';}
 else if(ascii.startsWith('RIFF')&&ascii.slice(8,12)==='WEBP'){mime='image/webp';extension='webp';}
 if(job.kind==='pdf'&&mime!=='application/pdf'||job.kind==='image'&&mime==='application/pdf')throw Error('Le type du fichier ne correspond pas à la sélection.');
 let name=(job.name||('sherloq.'+(extension||'png'))).replace(/[\\/:*?"<>|\x00-\x1f]/g,'_').slice(0,180);
 if(extension&&!(extension==='jpg'?/\.(jpe?g)$/i:new RegExp('\\.'+extension+'$','i')).test(name))name=name.replace(/\.[a-z0-9]{1,12}$/i,'')+'.'+extension;
 const sha256=[...new Uint8Array(await crypto.subtle.digest('SHA-256',await job.blob.arrayBuffer()))].map(v=>v.toString(16).padStart(2,'0')).join('');
 return {id:job.id,kind:job.kind,name,mime:mime||'application/octet-stream',total:job.blob.size,width:job.width,height:job.height,sha256};
}
