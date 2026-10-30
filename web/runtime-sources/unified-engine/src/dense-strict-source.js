import "../../runtime-context.js?v=0.30.0";
import {createOriginalSourceRegionsState,compileOriginalSourceRegions} from './source-region-geometry.js';
import {createSourceRegionView} from './source-region-view.js';
import {requireValue,checkAbort,controlCheckpoint} from './errors.js';
import {sourceRegionTransportBytes} from './source-region-transport.js';
import {retireCompositeOwners} from './composite-owner-release.js';
// Private native-context certificates never cross the worker transport. They
// distinguish context pixels from candidate membership without black painting.
const compiledSources=new WeakMap();
export async function createCompiledStrictDenseSource(prepared,{excluded=[],budget,signal,original,onOwner}={}){
 requireValue(prepared?.source?.readWindow&&prepared.sourceDomain?.descriptor&&prepared.candidateDomain?.descriptor&&prepared.contextDomain?.descriptor&&typeof prepared.fingerprint==='string','Verified prepared Dense domains are required.');
 checkAbort(signal);const metadata=budget.reserve(65536+sourceRegionTransportBytes([prepared.sourceDomain.descriptor,prepared.candidateDomain.descriptor,prepared.contextDomain.descriptor,excluded],{allowAliases:true})*8);let inner,complete=false,failed=false,primary,retired=false,retirement,finish;const construction=new Promise(resolve=>finish=resolve);
 // Publish construction ownership synchronously before the first digest/view
 // await. A parent can retry an unconfirmed ACK after this request rejects.
 const owner={source:null,dispose(){if(retirement)return retirement;retirement=(async()=>{await construction;if(retired)return;await inner?.dispose();metadata();retired=true;})();retirement.catch(()=>{retirement=null;});return retirement;}};
 try{
  requireValue(onOwner===undefined||typeof onOwner==='function','Compiled source ownership callback must be synchronous.');onOwner?.(owner);
  const sourceDomain=await compileOriginalSourceRegions(prepared.sourceDomain.descriptor),candidate=await compileOriginalSourceRegions(prepared.candidateDomain.descriptor),context=await compileOriginalSourceRegions(prepared.contextDomain.descriptor);
  requireValue(sourceDomain.fingerprint===prepared.sourceDomain.fingerprint&&candidate.fingerprint===prepared.candidateDomain.fingerprint&&context.fingerprint===prepared.contextDomain.fingerprint&&[candidate,context].every(d=>d.sourceSha256===sourceDomain.sourceSha256&&d.sourceWidth===sourceDomain.sourceWidth&&d.sourceHeight===sourceDomain.sourceHeight)&&prepared.width===sourceDomain.width&&prepared.height===sourceDomain.height&&prepared.origin[0]===sourceDomain.origin[0]&&prepared.origin[1]===sourceDomain.origin[1],'Prepared Dense grid or source certificate differs.');
  requireValue(!candidate.empty&&!context.empty&&context.rect.x0>=sourceDomain.rect.x0&&context.rect.y0>=sourceDomain.rect.y0&&context.rect.x1<=sourceDomain.rect.x1&&context.rect.y1<=sourceDomain.rect.y1,'Prepared Dense context lies outside its Original frame.');
  const covered=(spans,a,b)=>spans.some(([left,right])=>left<=a&&right>=b);
  for(let y=candidate.rect.y0;y<candidate.rect.y1;y++){if(y%32===0)await controlCheckpoint(signal);const allowed=sourceDomain.originalRowIntervals(y),support=context.originalRowIntervals(y);for(const[a,b]of candidate.originalRowIntervals(y))requireValue(covered(allowed,a,b)&&covered(support,a,b),'Prepared Dense candidates exceed the verified Original or RGB context.');}
  const excludedKey=JSON.stringify(excluded);inner=await createSourceRegionView(prepared.source,context.descriptor,{budget,signal});checkAbort(signal);
  const dx=context.origin[0]-sourceDomain.origin[0],dy=context.origin[1]-sourceDomain.origin[1],view={domain:sourceDomain,maxReadPixels:inner.maxReadPixels,includesRectangle:r=>inner.includesRectangle({...r,x:r.x-dx,y:r.y-dy}),*admittedRectangles(){for(const r of inner.admittedRectangles())yield{...r,x:r.x+dx,y:r.y+dy};},readWindow:(r,hooks)=>inner.readWindow({...r,x:r.x-dx,y:r.y-dy},hooks)};
  const source={view,domain:sourceDomain,original,analysisFingerprint:prepared.fingerprint},certificate={excludedKey,candidate};compiledSources.set(source,certificate);owner.source=source;complete=true;return owner;
 }catch(error){failed=true;primary=error;throw error;}finally{finish();if(!complete)await retireCompositeOwners([()=>owner.dispose()],failed?{primary}:{});}
}
export function filterStrictDenseCandidateMask(source,mask,offset,{width,shift}){
 const certificate=compiledSources.get(source);if(!certificate)return;
 requireValue(mask instanceof Uint8Array&&Number.isSafeInteger(offset)&&offset>=0&&Number.isSafeInteger(width)&&width>0&&Number.isSafeInteger(shift),'Invalid prepared Dense candidate grid.');
 const domain=certificate.candidate,[ox,oy]=source.domain.origin;
 for(let at=0;at<mask.length;){const absolute=offset+at,y=Math.floor(absolute/width)+shift+oy,x=absolute%width+shift+ox,length=Math.min(mask.length-at,width-absolute%width),spans=domain.originalRowIntervals(y);let edge=x;
  for(const[a,b]of spans){if(b<=x)continue;if(a>=x+length)break;const left=Math.max(x,a),right=Math.min(x+length,b);if(left>edge)mask.fill(0,at+edge-x,at+left-x);edge=Math.max(edge,right);}
  if(edge<x+length)mask.fill(0,at+edge-x,at+length);at+=length;
 }
}
function clipped(p,width,height){for(const[axis,bound,sign]of[[0,0,1],[0,width,-1],[1,0,1],[1,height,-1]]){const next=[];for(let i=0;i<p.length;i++){const a=p[i],b=p[(i+1)%p.length],inside=sign*(a[axis]-bound)>=0,other=sign*(b[axis]-bound)>=0;if(inside)next.push(a);if(inside!==other){const t=(bound-a[axis])/(b[axis]-a[axis]);next.push([a[0]+t*(b[0]-a[0]),a[1]+t*(b[1]-a[1])]);}}p=next;if(!p.length)break;}return p;}
// Additional tool exclusions are RGB exclusions, not merely a candidate mask.
// The native analysis grid remains the outer admitted source grid so retained
// points/maps keep their coordinates. Only the private reader's exact spans
// change; the public Original snapshot and every inherited ceiling stay intact.
export async function strictDenseSource(source,excluded,{budget,signal}={}){
 const certificate=compiledSources.get(source);if(certificate){checkAbort(signal);requireValue(JSON.stringify(excluded??[])===certificate.excludedKey,'Prepared Dense exclusions changed after upstream context compilation.');const loan={...source,dispose(){}};compiledSources.set(loan,certificate);return loan;}
 const parent=source.view.domain;requireValue(parent.fingerprint===source.domain.fingerprint,'Strict Dense source differs from its view.');if(!excluded?.length)return{...source,dispose(){}};
 const paths=structuredClone(excluded),zones=[];for(const p of paths){requireValue(Array.isArray(p)&&p.length>=3&&p.every(v=>Array.isArray(v)&&v.length===2&&v.every(n=>Number.isFinite(n)&&Math.abs(n)<=2**30)),'Invalid strict Dense source exclusion.');const polygon=clipped(p.map(([x,y])=>[x+parent.origin[0],y+parent.origin[1]]),parent.sourceWidth,parent.sourceHeight);if(polygon.length<3)continue;const xs=polygon.map(v=>v[0]),ys=polygon.map(v=>v[1]),x0=Math.min(...xs),x1=Math.max(...xs),y0=Math.min(...ys),y1=Math.max(...ys),area=polygon.reduce((sum,a,i)=>{const b=polygon[(i+1)%polygon.length];return sum+a[0]*b[1]-b[0]*a[1];},0);if(x1<=x0||y1<=y0||Math.abs(area)<1e-10)continue;zones.push({id:'dense-tool-exclusion-'+zones.length,kind:'exclusion',enabled:true,origin:'human',polygon,x0,y0,x1,y1});}
 if(!zones.length)return{...source,dispose(){}};checkAbort(signal);const state=await createOriginalSourceRegionsState({width:parent.sourceWidth,height:parent.sourceHeight,sourceSha256:parent.sourceSha256});await state.replaceZones(zones,{positiveMode:'whole',enabled:true});const child=await compileOriginalSourceRegions(state.snapshot(),{ceiling:parent.descriptor});checkAbort(signal);
 const reader={width:parent.sourceWidth,height:parent.sourceHeight,sha256:parent.sourceSha256,readWindow:(rect,hooks)=>source.view.readWindow({...rect,x:rect.x-parent.origin[0],y:rect.y-parent.origin[1]},hooks)},inner=await createSourceRegionView(reader,child.descriptor,{budget,signal}),dx=child.origin[0]-parent.origin[0],dy=child.origin[1]-parent.origin[1];
 const domain=Object.freeze({...child,width:parent.width,height:parent.height,origin:parent.origin,originalDomainFingerprint:parent.fingerprint,contains:(x,y)=>child.containsOriginal(x+parent.origin[0],y+parent.origin[1]),rowIntervals:y=>child.originalRowIntervals(y+parent.origin[1]).map(([a,b])=>[a-parent.origin[0],b-parent.origin[0]])});
 const view={domain,*admittedRectangles(){for(const r of inner.admittedRectangles())yield{...r,x:r.x+dx,y:r.y+dy};},readWindow:(rect,hooks)=>inner.readWindow({...rect,x:rect.x-dx,y:rect.y-dy},hooks),dispose:()=>inner.dispose()};
 return{...source,view,domain,dispose:()=>inner.dispose()};
}
