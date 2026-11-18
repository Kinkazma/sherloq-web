import{compileOriginalSourceRegions}from'./unified-engine/src/source-region-geometry.js';
import{cloningParams}from'./unified-engine/src/cloning.js';
import{createCooperator,checkAbort,EngineError}from'./unified-engine/src/errors.js';
// Optional presenter metadata only; the historical draw limits remain2048
// matches/8192group memberships (and4096points when showPoints is requested).
export const CLASSICAL_CONTEXT_PREVIEW_BYTES=8192*512+65536;
const algorithms={'tampering.copyMove.brisk':'BRISK','tampering.copyMove.orb':'ORB','tampering.copyMove.akaze':'AKAZE'},mutable=new Set(['minimum','showPoints','hideLines']);
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b),sha=s=>/^[a-f0-9]{64}$/.test(s??''),surface=s=>s?.format==='rgb8'&&typeof s.id==='string'&&Number.isSafeInteger(s.revision)&&s.revision>0;
const fail=message=>{throw new EngineError('PREVIEW_UNAVAILABLE',message);};
export function classicalContextPreviewCandidate({output,source,domain,operation,params}={}){
 const descriptor=domain?.descriptor??domain,algorithm=algorithms[operation],fragments=output?.data?.metadata?.fragments,grid=output?.provenance?.sourceRegionGrid,background=output?.sourceRegionSourceSurface,prior=output?.provenance?.params;
 if(!algorithm||output?.operation!==operation||output.data?.algorithm!==algorithm||!sha(source?.sha256)||!surface(source?.surface)||output.provenance?.originalSha256!==source.sha256||descriptor?.snapshot?.sourceSha256!==source.sha256||descriptor.snapshot.width!==source.surface?.width||descriptor.snapshot.height!==source.surface?.height||output.sourceRegionDomain?.fingerprint!==descriptor.fingerprint||output.provenance.sourceRegionDomain?.fingerprint!==descriptor.fingerprint||!same(output.sourceRegionOrigin,descriptor.origin)||!grid||grid.width!==descriptor.width||grid.height!==descriptor.height||grid.sourceWidth!==source.surface.width||grid.sourceHeight!==source.surface.height||!surface(background)||background.width!==descriptor.width||background.height!==descriptor.height||!surface(output.surface)||output.surface.width!==descriptor.width||output.surface.height!==descriptor.height||output.nativeContexts?.kind!=='independent-native-rgb-contexts'||!Array.isArray(fragments)||fragments.length<1||fragments.length>8192||output.nativeContexts.fragments?.length!==fragments.length||output.metrics?.sourceRegionPolicy!=='native-'+algorithm.toLowerCase()+'-contexts-global-matching'||!prior)return false;
 let requested,canonical;try{requested=cloningParams(params);canonical=cloningParams(prior);}catch{return false;}
 for(const key of new Set([...Object.keys(requested),...Object.keys(canonical)]))if(!mutable.has(key)&&!same(requested[key],canonical[key]))return false;
 if(canonical.maskImageId&&!output.provenance.references?.some(r=>r.imageId===canonical.maskImageId&&sha(r.originalSha256)))return false;
 return true;
}
/** Validate native bank + independent observation contexts before any RGB. The
 * bank itself is already global by native design; never split/re-match it. */
export async function validateClassicalContextPreview(args){
 if(!classicalContextPreviewCandidate(args))fail('Classical context preview source, geometry or native recipe changed.');
 const{output,params,signal}=args,domain=await compileOriginalSourceRegions(args.domain),d=output.data,fragments=d.metadata.fragments,cooperate=createCooperator(signal);let active=new Map(),index=0,area=0,total=0,native=0;
 const accept=rect=>{const f=fragments[index],r=f?.rect,other=output.nativeContexts.fragments[index],expected=[rect.x+domain.origin[0],rect.y+domain.origin[1],rect.x+rect.width+domain.origin[0],rect.y+rect.height+domain.origin[1]];
  if(!f||f.index!==index||!r||!same([r.x,r.y,r.width,r.height],[rect.x,rect.y,rect.width,rect.height])||!same(f.originalBounds,expected)||(!other||other.index!==f.index||!same(other.rect,r)||!same(other.originalBounds,f.originalBounds)||other.status!==f.status||other.evaluable!==f.evaluable||other.totalFeatures!==f.totalFeatures)||!['native','not-evaluable'].includes(f.status)||f.evaluable!==(f.status==='native')||!Number.isSafeInteger(f.totalFeatures)||f.totalFeatures<0||f.status==='not-evaluable'&&f.totalFeatures!==0)fail('Classical native context coverage or coordinates changed.');
  if(f.status==='native')native++;total+=f.totalFeatures;area+=rect.width*rect.height;index++;
 };
 for(let y=0;y<domain.height;y++){await cooperate();const spans=domain.rowIntervals(y);if(spans.length>8192)fail('Classical context preview exceeds its optional metadata workspace.');const next=new Map();for(const[x,right]of spans){const key=x+':'+right,old=active.get(key);next.set(key,old?{...old,height:old.height+1}:{x,y,width:right-x,height:1});}for(const[key,r]of active)if(!next.has(key))accept(r);active=next;}
 for(const r of active.values())accept(r);
 const evaluation=output.nativeContextEvaluation;if(index!==fragments.length||area!==domain.countIncluded||evaluation?.total!==index||evaluation.evaluable!==native||evaluation.unavailable!==index-native)fail('Classical context preview does not cover its complete admitted population.');
 if(!(d.points instanceof Float64Array)||d.points.length%7||!(d.matches instanceof Float64Array)||d.matches.length%3||d.matches.length>2048*3||!(d.groupLengths instanceof Uint32Array)||!(d.groupIndices instanceof Uint32Array)||d.groupIndices.length>8192||d.groupLengths.length!==d.matches.length/3||params.showPoints&&d.points.length>4096*7)fail('Complete bounded native classical tables are required.');
 const n=d.points.length/7;if(n>total||native&&(!d.stats||d.stats.total!==total||d.stats.filtered!==n||d.stats.matches!==d.matches.length/3))fail('Classical retained bank counts differ from native context provenance.');
 for(let i=0;i<d.points.length;i++){if((i&4095)===0)await cooperate();if(!Number.isFinite(d.points[i]))fail('A native classical point contains non-finite data.');if(i%7===0){const x=d.points[i],y=d.points[i+1];if(x<0||y<0||x>=domain.width||y>=domain.height||!domain.contains(Math.floor(x),Math.floor(y)))fail('A retained classical point is outside its admitted Original population.');}}
 for(let i=0;i<d.matches.length;i++){if((i&4095)===0)await cooperate();const v=d.matches[i];if(!Number.isFinite(v)||v<0||i%3!==2&&(!Number.isSafeInteger(v)||v>=n))fail('A native classical match references another point bank.');}
 let offset=0;for(const length of d.groupLengths){offset+=length;if(!Number.isSafeInteger(offset)||offset>d.groupIndices.length)fail('Native classical group memberships are incomplete.');}if(offset!==d.groupIndices.length)fail('Native classical group memberships have an unowned tail.');
 for(let i=0;i<d.groupIndices.length;i++){if((i&4095)===0)await cooperate();if(d.groupIndices[i]>=d.matches.length/3)fail('Native classical group references another match bank.');}
 checkAbort(signal);return{schema:'classical-context-preview/1',algorithm:d.algorithm,contexts:index,sourceSha256:sourceSha(domain),domainFingerprint:domain.fingerprint,origin:[...domain.origin],bank:'unchanged-native-union-global-matching',nativeTablesUnchanged:true};
}
const sourceSha=domain=>domain.sourceSha256;
