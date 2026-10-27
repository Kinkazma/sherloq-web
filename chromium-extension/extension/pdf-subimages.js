// Geometry and native pixel windows only. A detector label never decides
// whether a PDF sub-image may receive its own histogram.
const polygon=({x0,y0,x1,y1})=>[[x0,y0],[x1,y0],[x1,y1],[x0,y1]];
function detectorDomains(width,height,panels=[]){
 if(![width,height].every(n=>Number.isSafeInteger(n)&&n>0))throw new TypeError('Invalid PDF image dimensions.');
 const found=new Map();
 for(const panel of panels){const r=panel?.rectangle;if(!Array.isArray(r)||r.length!==4||!r.every(Number.isFinite))continue;
  const x0=Math.max(0,Math.floor(r[0])),y0=Math.max(0,Math.floor(r[1])),x1=Math.min(width,Math.ceil(r[2])),y1=Math.min(height,Math.ceil(r[3]));
  if(x1<=x0||y1<=y0)continue;const rect={x0,y0,x1,y1};found.set([x0,y0,x1,y1].join(':'),rect);
 }
 let rectangles=[...found.values()],discardedContainers=0,mergedOverlaps=0;
 // A proposal enclosing finer proposals is not an additional pixel domain.
 // Keep its leaves. For ambiguous partial overlaps, combine their envelope
 // instead of assigning the shared pixels two different histogram mappings.
 rectangles=rectangles.filter((r,index,all)=>{const container=all.some((s,j)=>j!==index&&r.x0<=s.x0&&r.y0<=s.y0&&r.x1>=s.x1&&r.y1>=s.y1);if(container)discardedContainers++;return !container;});
 let again=true;while(again){again=false;outer:for(let i=0;i<rectangles.length;i++)for(let j=i+1;j<rectangles.length;j++){const a=rectangles[i],b=rectangles[j];if(Math.min(a.x1,b.x1)<=Math.max(a.x0,b.x0)||Math.min(a.y1,b.y1)<=Math.max(a.y0,b.y0))continue;rectangles.splice(j,1);rectangles[i]={x0:Math.min(a.x0,b.x0),y0:Math.min(a.y0,b.y0),x1:Math.max(a.x1,b.x1),y1:Math.max(a.y1,b.y1)};mergedOverlaps++;again=true;break outer;}}
 // The PDF bitmap itself is an exact source domain when no finer panel was
 // detected. Do not invent boundaries or discard an unclassified bitmap.
 return {rectangles:rectangles.length?rectangles:[{x0:0,y0:0,x1:width,y1:height}],detected:found.size>0,discardedContainers,mergedOverlaps};
}
export function pdfSubimageRectangles(width,height,panels=[]){return detectorDomains(width,height,panels).rectangles;}
export function composePDFSubimageScope(image,prepared){
 if(image.width!==prepared?.width||image.height!==prepared?.height||!prepared.sourceSha256)throw new Error('PDF sub-image preparation does not match its native source.');
 const domains=detectorDomains(image.width,image.height,prepared.panels?.panels),subimages=domains.rectangles;
 return {schema:'sherloq.pdf-subimages/1',version:'pdf-subimages-1',coordinates:'original-pixels',sourceSha256:prepared.sourceSha256,width:image.width,height:image.height,status:'ready',subimages,regions:subimages.map(r=>({...r,polygon:polygon(r)})),excluded:[],classificationApplied:false,coverage:{subimages:domains.detected?'detected-panel-rectangles':'embedded-bitmap',exhaustive:false,domainPolicy:'prefer-leaf-panels-merge-overlaps',discardedContainers:domains.discardedContainers,mergedOverlaps:domains.mergedOverlaps},models:{panels:prepared.panels?.detector},provenance:prepared.provenance};
}
export async function pdfSubimageFingerprint(scope){return [...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify([scope.schema,scope.sourceSha256,scope.width,scope.height,scope.subimages]))))].map(v=>v.toString(16).padStart(2,'0')).join('');}

// Opening an extracted figure must not discard its PDF sub-image domains.
// This identity page reuses the same compositor while retaining image-native
// coordinates; the selected file remains the extracted image, not a PDF page.
export function createPDFImageDomainPage(image,entry){
 const job=image?.job;if(!job||job.id!==entry?.id||job.width!==entry.raw?.width||job.height!==entry.raw?.height)throw new TypeError('An extracted PDF figure requires its matching native image source.');
 return {id:'pdf-figure:'+job.id,job,placements:[{job,image:{...image,entry},matrix:[1,0,0,1,0,0],occurrence:{textExclusions:[]}}]};
}

export function createPDFSubimageSurface(raw,rectangle){
 const {x0,y0,x1,y1}=rectangle,width=x1-x0,height=y1-y0;
 if(![x0,y0,x1,y1].every(Number.isSafeInteger)||x0<0||y0<0||width<1||height<1||x1>raw.width||y1>raw.height)throw new RangeError('Invalid native PDF sub-image window.');
 let refs=1,closed=false;raw.retain?.();
 const alive=()=>{if(closed)throw Object.assign(Error('PDF sub-image released.'),{code:'CANCELLED'});};
 return {width,height,native:true,origin:[x0,y0],domain:{...rectangle},
  retain(){alive();refs++;},release(){if(closed||--refs)return;closed=true;raw.release?.();},
  prepare:()=>!closed,
  draw(context){alive();context.save();context.beginPath();context.rect(0,0,width,height);context.clip();context.translate(-x0,-y0);raw.draw(context);context.restore();},
  async readPixels(rect){alive();if(![rect.x,rect.y,rect.width,rect.height].every(Number.isSafeInteger)||rect.x<0||rect.y<0||rect.width<1||rect.height<1||rect.x+rect.width>width||rect.y+rect.height>height)throw new RangeError('Native PDF sub-image read exceeds its domain.');
   const value=await raw.readPixels({...rect,x:rect.x+x0,y:rect.y+y0});alive();return value;
  }
 };
}
