export const MAX_BYTES = 256 * 1024 ** 2;
export async function fetchResource(url, {html = false, signal, maxBytes=MAX_BYTES,cache=html?'default':'force-cache'} = {}) {
  const u = new URL(url);
  if (!['http:', 'https:', 'file:'].includes(u.protocol) || u.username || u.password) throw Error('Ressource inaccessible depuis l’extension.');
  const timeout=AbortSignal.timeout(45_000);
  const response = await fetch(u.href, {credentials: 'include', cache, signal: signal ? AbortSignal.any([signal,timeout]) : timeout});
  if (!response.ok) throw Error('Téléchargement : HTTP ' + response.status);
  const limit = html ? 2 * 1024 ** 2 : Math.min(MAX_BYTES,maxBytes);
  if (Number(response.headers.get('Content-Length')) > limit) throw Error('Ressource trop volumineuse. Aucune réduction automatique.');
  const reader = response.body.getReader(), chunks = []; let size = 0;
  try {
    for (;;) { const {value, done} = await reader.read(); if (done) break; size += value.byteLength; if (size > limit) throw Error('Ressource trop volumineuse. Aucune réduction automatique.'); chunks.push(value); }
  } finally { await reader.cancel().catch(() => {}); }
  const blob = new Blob(chunks, {type: response.headers.get('Content-Type')?.split(';')[0] || ''});
  return {blob, url: response.url || u.href};
}
export async function resolveImage(selection,{signal,onCandidate=()=>{},maxPixels=100_000_000,maxBytes=MAX_BYTES}={}) {
  let best = null, next = 0, writes = Promise.resolve(); const errors = [],variants=[];
  const candidates = selection.candidates.slice(0,12);
  // A slow or broken original must not hold up other usable sources.
  const available = candidates.findIndex(c=>c.url===selection.displayedURL);
  if(available>0)candidates.unshift(...candidates.splice(available,1));
  await Promise.all(Array.from({length:Math.min(3,candidates.length)},async()=>{
    while(next<candidates.length){
      signal?.throwIfAborted();const candidate=candidates[next++];
      try {
        const {blob,url}=await fetchResource(candidate.url,{signal,maxBytes}),image=await createImageBitmap(blob);
        const {width,height}=image;image.close();signal?.throwIfAborted();
        if(width*height>maxPixels)throw Error('Image supérieure à 100 MP. Aucune réduction automatique.');
        variants.push({url,width,height,reason:candidate.reason});
        if(!best||width*height>best.width*best.height){
          best={blob,url,width,height,reason:candidate.reason,kind:'image',sourcePage:selection.sourcePage,name:fileName(url,blob.type)};
          const value=best;writes=writes.then(()=>{signal?.throwIfAborted();return onCandidate(value);});
        }
      }catch(error){if(signal?.aborted)throw error;errors.push({url:candidate.url,message:error.message});}
    }
  }));
  await writes;signal?.throwIfAborted();
  if(!best)throw Error(errors.at(-1)?.message||'Aucune image récupérable.');
  return {...best,errors,variants};
}
export function fileName(url, type) {
  let name;
  try { name = decodeURIComponent(new URL(url).pathname.split('/').at(-1)); } catch {}
  name = (name || 'image').replace(/[\\/:*?"<>|\x00-\x1f]/g, '_').slice(0, 140);
  if (!/\.[a-z0-9]{2,5}$/i.test(name)) name += type === 'application/pdf' ? '.pdf' : type === 'image/jpeg' ? '.jpg' : type === 'image/webp' ? '.webp' : '.png';
  return name;
}
