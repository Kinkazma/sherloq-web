// Display only: native SSIM/ROI samples were already produced by the checkpoint.
// Coarse morphology/connectivity is provisional, never an exportable result.
export function paintSsgRetainedMask(data,g,draft,{sourceSha256,domainFingerprint=null}={}){
 const invalid=message=>{throw Object.assign(new TypeError(message),{code:'INVALID_INPUT'});};
 if(draft?.schema==='sherloq.ssg-window-draft/1'){
  if(draft.exact!==false||draft.provisional!==true||draft.exportable!==false||draft.originalWidth!==g.w||draft.originalHeight!==g.h||draft.provenance?.sourceSha256!==sourceSha256||!['independent','global'].includes(draft.cloneWindowMode)||!Array.isArray(draft.windows))invalid('SSG window draft identity or parent grid differs.');
  const membership=draft.displayMembership,ids=new Set();
  if(domainFingerprint!==null&&(!(membership instanceof Uint8Array)||membership.length!==g.width*g.height||draft.displayDomainFingerprint!==domainFingerprint))invalid('Scoped SSG window membership is missing or stale.');
  if(membership&&(!(membership instanceof Uint8Array)||membership.length!==g.width*g.height))invalid('Invalid SSG window display membership.');
  for(const window of draft.windows){
   if(typeof window.id!=='string'||ids.has(window.id)||!Array.isArray(window.origin)||window.origin.length!==2||!window.origin.every(Number.isSafeInteger))invalid('Invalid SSG draft window identity.');ids.add(window.id);
   if(window.status==='empty'){if(window.draft!==null)invalid('Empty SSG window carries a draft.');continue;}
   const child=window.draft;
   if(window.status!=='complete'||!child||child.exact!==false||child.provisional!==true||child.exportable!==false||!(child.mask instanceof Uint8Array)||child.mask.length!==child.width*child.height||!child.mask.every(v=>v<=1)||![child.width,child.height,child.logicalWidth,child.logicalHeight,child.step,child.originalWidth,child.originalHeight].every(n=>Number.isSafeInteger(n)&&n>0)||child.width!==Math.ceil(child.logicalWidth/child.step)||child.height!==Math.ceil(child.logicalHeight/child.step)||![child.scaleX,child.scaleY].every(n=>Number.isFinite(n)&&n>0)||child.provenance?.sourceSha256!==sourceSha256||window.origin[0]<0||window.origin[1]<0||window.origin[0]+child.originalWidth>g.w||window.origin[1]+child.originalHeight>g.h)invalid('Native SSG child draft geometry or source differs.');
  }
  for(let y=0;y<g.height;y++)for(let x=0;x<g.width;x++){
   const out=y*g.width+x;if(membership&&!membership[out])continue;let selected=false;
   for(const window of draft.windows){if(window.status!=='complete')continue;const child=window.draft,lx=x*g.step-window.origin[0],ly=y*g.step-window.origin[1];if(lx<0||ly<0||lx>=child.originalWidth||ly>=child.originalHeight)continue;
    const nx=Math.min(child.logicalWidth-1,Math.max(0,Math.floor((lx+.5)*child.scaleX))),ny=Math.min(child.logicalHeight-1,Math.max(0,Math.floor((ly+.5)*child.scaleY))),at=Math.floor(ny/child.step)*child.width+Math.floor(nx/child.step);if(child.mask[at]){selected=true;break;}
   }
   if(selected)for(let c=0;c<3;c++)data[out*3+c]=Math.round(data[out*3+c]*.5+[255,50,25][c]*.5);
  }
  return data;
 }
 if(!draft||draft.exact!==false||draft.provisional!==true||draft.exportable!==false||!(draft.mask instanceof Uint8Array)||draft.mask.length!==draft.width*draft.height||![draft.width,draft.height,draft.logicalWidth,draft.logicalHeight,draft.step,draft.originalWidth,draft.originalHeight].every(n=>Number.isSafeInteger(n)&&n>0)||draft.width!==Math.ceil(draft.logicalWidth/draft.step)||draft.height!==Math.ceil(draft.logicalHeight/draft.step)||draft.originalWidth!==g.w||draft.originalHeight!==g.h||![draft.scaleX,draft.scaleY].every(n=>Number.isFinite(n)&&n>0)||draft.provenance?.sourceSha256!==sourceSha256)invalid('Retained SSG draft identity or geometry differs from its native result.');
 const membership=draft.displayMembership;if(domainFingerprint!==null&&(!(membership instanceof Uint8Array)||membership.length!==g.width*g.height||draft.displayDomainFingerprint!==domainFingerprint))invalid('Scoped SSG display membership is missing or stale.');
 if(membership&&(!(membership instanceof Uint8Array)||membership.length!==g.width*g.height))invalid('Invalid SSG display membership.');
 for(let y=0;y<g.height;y++)for(let x=0;x<g.width;x++){const out=y*g.width+x;if(membership&&!membership[out])continue;const nx=Math.min(draft.logicalWidth-1,Math.max(0,Math.floor((x*g.step+.5)*draft.scaleX))),ny=Math.min(draft.logicalHeight-1,Math.max(0,Math.floor((y*g.step+.5)*draft.scaleY))),at=Math.floor(ny/draft.step)*draft.width+Math.floor(nx/draft.step);if(!draft.mask[at])continue;for(let c=0;c<3;c++)data[out*3+c]=Math.round(data[out*3+c]*.5+[255,50,25][c]*.5);}
 return data;
}
