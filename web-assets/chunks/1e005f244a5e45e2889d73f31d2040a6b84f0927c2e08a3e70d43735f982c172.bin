import "../../runtime-context.js?v=0.30.0";
import {createOcrRetirementOwner,retireOcrLeases} from './ocr-owned-retirement.js';
import {createUsefulOperationEvidence} from './useful-operation-evidence.js';
import {retireCompositeOwners} from './composite-owner-release.js';
import {createSourceRegionView} from './source-region-view.js';
import {sourceRegionTransportBytes} from './source-region-transport.js';
import {requireValue,checkAbort} from './errors.js';

/** Recognition sees native rectangular partitions of the admitted source,
 * never a black-filled envelope. Fragment boundaries can split a text line;
 * those readings remain explicit rather than borrowing excluded context. */
export async function prepareSourceRegionOcr(image,{budget,signal,onOwner}={}){
 const metadataLease=budget.reserve(sourceRegionTransportBytes(image.sourceRegionDomain,{allowAliases:true})*4+65536),owners=new Set();
 let view,finishPreparing,sha256;const preparedDone=new Promise(resolve=>finishPreparing=resolve);
 const retirement=createOcrRetirementOwner(async()=>{
  await preparedDone;
  await retireCompositeOwners([...owners].map(owner=>()=>owner.release()));
  await view?.dispose();
  await metadataLease();
 });
 const prepared={get view(){return view;},get sha256(){return sha256;},
  own(release){let owner;owner=createOcrRetirementOwner(release,{onReleased:()=>owners.delete(owner)});owners.add(owner);return owner;},
  transfer(owner){owners.delete(owner);},dispose:()=>retirement.release()};
 let failed=false,primary;
 try{
  // The parent keeps this owner even if validation or initialization rejects.
  onOwner?.(prepared);
  const descriptor=structuredClone(image.sourceRegionDomain),original=image.originalSource,width=image.width,height=image.height,origin=Array.isArray(image.sourceRegionOrigin)?[...image.sourceRegionOrigin]:null;
  sha256=image.sha256;requireValue(original?.surface&&original.sha256===sha256,'Strict OCR requires its original source identity and native reader.');
  view=await createSourceRegionView({...original.surface,sha256},descriptor,{budget,signal});checkAbort(signal);
  requireValue(view.domain.width===width&&view.domain.height===height&&origin?.length===2&&origin.every((v,i)=>v===view.domain.origin[i]),'Strict OCR source grid or origin differs.');
 }catch(error){failed=true;primary=error;}finally{finishPreparing();}
 if(failed){await retireCompositeOwners([()=>prepared.dispose()],{primary});throw primary;}
 return prepared;
}

export async function analyzeSourceRegionOcr(prepared,parameters,{api,budget,payloadBytes,signal,onProgress,backend}={}){
 const {view,sha256}=prepared,releases=[];let complete=false,failed=false,primary;
 try{
  const regions=[],fragments=[];let included=0,index=0;
  for(const rect of view.admittedRectangles()){
   checkAbort(signal);const fragment=index++;let native,nativeOwner,nativeFailed=false,nativePrimary;
   try{
    const input={format:'rgb8',width:rect.width,height:rect.height,sha256,
     readWindow(part,options={}){
      requireValue(part&&['x','y','width','height'].every(k=>Number.isSafeInteger(part[k]))&&part.x>=0&&part.y>=0&&part.width>0&&part.height>0&&part.x+part.width<=rect.width&&part.y+part.height<=rect.height,'OCR tried to sample outside its admitted native fragment.');
      return view.readWindow({...part,x:rect.x+part.x,y:rect.y+part.y},options);
     }};
    onProgress?.({phase:'ocr-source-fragment',completed:included,total:view.domain.countIncluded,fragment});
    native=await api.analyze(input,parameters,{signal,backend,onProgress:value=>onProgress?.({...value,sourceFragment:fragment,sourceFragmentBounds:[rect.x,rect.y,rect.x+rect.width,rect.y+rect.height]})});nativeOwner=prepared.own(()=>native.release?.());checkAbort(signal);
    const raw=native.regions??native.data?.regions;requireValue(Array.isArray(raw),'OCR analyzer returned no native regions.');
    releases.push(prepared.own(budget.reserve(payloadBytes({regions:raw,nativeText:native.nativeText,metadata:native.metadata,metrics:native.metrics})*2+4096)));
    const owned=structuredClone({regions:raw,nativeText:native.nativeText,metadata:native.metadata??{},metrics:native.metrics??{}});
    for(const [i,region]of owned.regions.entries()){
     const b=region.bounds;requireValue(Array.isArray(b)&&b.length===4&&b.every(Number.isFinite)&&b[0]>=0&&b[1]>=0&&b[2]>b[0]&&b[3]>b[1]&&b[2]<=rect.width&&b[3]<=rect.height,'OCR returned geometry outside its admitted native fragment.');
     if(region.polygon)requireValue(Array.isArray(region.polygon)&&region.polygon.length>=3&&region.polygon.every(p=>Array.isArray(p)&&p.length===2&&p.every(Number.isFinite)&&p[0]>=0&&p[1]>=0&&p[0]<=rect.width&&p[1]<=rect.height),'OCR returned a polygon outside its admitted native fragment.');
     regions.push({...region,id:'source-fragment-'+fragment+'/'+(region.id??i),bounds:b.map((v,k)=>v+(k%2?rect.y:rect.x)),...(region.polygon?{polygon:region.polygon.map(([x,y])=>[x+rect.x,y+rect.y])}:{}),lineKey:'source-fragment-'+fragment+'/'+(region.lineKey??i),sourceFragment:fragment});
    }
    fragments.push({index:fragment,bounds:[rect.x,rect.y,rect.x+rect.width,rect.y+rect.height],regions:owned.regions.length,nativeText:owned.nativeText??null,metadata:owned.metadata,metrics:owned.metrics});
    included+=rect.width*rect.height;
   }catch(error){nativeFailed=true;nativePrimary=error;throw error;}finally{await retireCompositeOwners([()=>nativeOwner?.release()],nativeFailed?{primary:nativePrimary}:{});}
  }
  checkAbort(signal);requireValue(included===view.domain.countIncluded,'Strict OCR did not visit the complete admitted native source.');
  onProgress?.({phase:'ocr-source-fragment',completed:included,total:included,fragmentCount:fragments.length});
  const resultOwner=createOcrRetirementOwner(()=>retireOcrLeases(releases.map(owner=>()=>owner.release()))),release=()=>resultOwner.release();for(const owner of releases)prepared.transfer(owner);complete=true;
  const evidence=fragments.map(f=>f.metrics.usefulWork),first=evidence[0],sameEvidence=first&&evidence.every(e=>e?.schema===first.schema&&e.completedAfterAck===true&&e.numericAdmissible===true&&e.precision===first.precision&&e.profile===first.profile&&e.threads===first.threads&&e.runtime===first.runtime&&e.codeSha256===first.codeSha256&&JSON.stringify(e.parameters)===JSON.stringify(first.parameters)&&JSON.stringify(e.modelShas)===JSON.stringify(first.modelShas)),gpu=sameEvidence&&evidence.some(e=>e.actualGpuWork===true),usefulWork=sameEvidence?createUsefulOperationEvidence({...first,actualBackend:gpu?'hybrid':'cpu',actualCpuWork:true,actualGpuWork:gpu,regime:evidence.every(e=>e.regime===first.regime)?first.regime:'unknown',resourceContext:first.resourceContext}):null;
  return{regions,...(fragments.length===1?{nativeText:fragments[0].nativeText}:{}),metadata:{...(fragments.length===1?fragments[0].metadata:{}),sourceRegionRecognition:{schema:'sherloq.strict-ocr/1',strictOriginalSamples:true,sourceRegionFingerprint:view.domain.fingerprint,origin:[...view.domain.origin],includedPixels:included,fragmentCount:fragments.length,partitions:'exact native admitted rectangles; every admitted pixel belongs to one fragment',context:'Each OCR preprocessing and recognition call sees one fully admitted fragment only.',readingOrder:'Native line hierarchy within each fragment; source-coordinate line order across fragments. Lines cut by exclusions or acquisition boundaries may remain fragmented.',resolutionReduced:false,excludedPixelsRead:false,fragments}},metrics:{usefulWork,sourceFragments:fragments.length,nativeFragments:fragments.map(f=>({index:f.index,...f.metrics}))},release};
 }catch(error){failed=true;primary=error;throw error;}finally{if(!complete)await retireCompositeOwners(releases.map(owner=>()=>owner.release()),failed?{primary}:{});}
}

/** The legacy OCR owner performs the strict partition before any native model
 * call. Keep dispatch narrow: no other operation inherits this admission. */
export const SOURCE_REGION_OCR_ADAPTER=Object.freeze({shapes:Object.freeze(['membership','native-regions']),run:({task,runLegacy,signal})=>{checkAbort(signal);return runLegacy(task);}});
