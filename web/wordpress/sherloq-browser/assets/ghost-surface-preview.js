import {ghostSpatialContexts} from './unified-engine/src/ghost-spatial-presentation.js';
import {GHOST_PALETTES} from './unified-engine/src/ghost-palettes.js';
import {createAdaptivePreview} from './adaptive-preview.js?v=0.30.0';
import {createCooperator} from './unified-engine/src/errors.js';
const MAX_SIDE=2048,MAX_READ=4096,adaptive=createAdaptivePreview();
const fail=(code,message)=>{throw Object.assign(Error(message),{code});};
const check=signal=>{if(signal?.aborted)fail('CANCELLED','Retained Ghost preview cancelled.');};
const descriptor=(s,format,w,h)=>typeof s?.id==='string'&&s.id.length>0&&s.id.length<=4096&&Number.isSafeInteger(s.revision)&&s.revision>=0&&s.format===format&&s.width===w&&s.height===h;
/** A retained view is possible only for an already computed native quality.
 * New quality ranges/phases must still use scientific per-context processing. */
export function ghostSurfacePreviewContract({output,params={},view={}}={}){
 const d=output?.data,p=output?.provenance?.params??{},domain=output?.sourceRegionDomain??output?.provenance?.sourceRegionDomain;
 if(output?.operation!=='jpeg.ghosts'||d?.layout!=='independent-native-block-atlas; one float64 raw/map surface per quality'||!(d.nativeCellCount>0)||typeof domain?.fingerprint!=='string'||!domain.fingerprint||domain.fingerprint.length>256)return null;
 if(Object.keys(params).some(k=>!['grayscale','includeOriginal'].includes(k)&&(!Object.hasOwn(p,k)||JSON.stringify(params[k])!==JSON.stringify(p[k]))))return null;
 const original=(view?.layerId??view?.id??view)==='original';if(original)return null;
 if((!Array.isArray(d.qualities)&&!ArrayBuffer.isView(d.qualities))||!Number.isSafeInteger(d.qualities.length)||d.qualities.length<1||d.qualities.length>101)return null;const qualities=Array.from(d.qualities);if(qualities.some(q=>!Number.isInteger(q)||q<0||q>100))return null;
 const wanted=view?.quality??(/^quality-(\d+)$/.exec(view?.layerId??view?.id??'')?.[1]),index=wanted!==undefined?qualities.indexOf(Number(wanted)):Math.max(0,Math.min(qualities.length-1,Math.trunc(view?.index??0)));
 if(index<0||!Number.isSafeInteger(index))return null;
 const quality=qualities[index],width=d.cols,height=d.rows,map=output.planeSurfaces?.['ghost_map_'+quality],scope=output.maskSurfaces?.atlas_scope;
 if(![width,height].every(v=>Number.isSafeInteger(v)&&v>0)||width>MAX_READ||!descriptor(map,'float64',width,height)||!descriptor(scope,'mask8',width,height))return null;
 let spatial;if(d.presentation?.coordinates==='source-region-native-pixels'){try{spatial=ghostSpatialContexts(d);}catch{return null;}const background=output.sourceRegionSourceSurface??d.originalSurface;if(!descriptor(background,'rgb8',spatial.width,spatial.height))return null;spatial={...spatial,background};}
 return{width:spatial?.width??width,height:spatial?.height??height,atlasWidth:width,atlasHeight:height,spatial,quality,index,map,scope,sourceIdentity:[/^[a-f0-9]{64}$/i.test(domain.sourceSha256??'')?domain.sourceSha256.toLowerCase():null,domain.fingerprint]};
}
function geometry(c,plan){if(plan?.token?.schema!=='adaptive-preview-token/1'||plan.logicalWidth!==c.width||plan.logicalHeight!==c.height||![plan.width,plan.height,plan.step,plan.pixels].every(v=>Number.isSafeInteger(v)&&v>0)||plan.step<1||plan.width!==Math.ceil(c.width/plan.step)||plan.height!==Math.ceil(c.height/plan.step)||Math.max(plan.width,plan.height)>MAX_SIDE||plan.pixels!==plan.width*plan.height)fail('INVALID_INPUT','Retained Ghost sampling differs from its native atlas.');return plan;}
/** One optional sampled scalar+validity grid, charged to the native budget.
 * The caller serializes these callbacks with its engine queue and separately
 * admits RGB +64KiB for the returned frame and each bounded numeric transport.
 * Idle reclamation only drops sampled arrays; it never releases native maps. */
export function createGhostSurfacePreview({readPlane,readMask,readSource,reserve,release,updateReservation}={}){
 if([readPlane,readMask,reserve,release].some(fn=>typeof fn!=='function'))fail('INVALID_INPUT','Retained Ghost preview requires explicit owned readers and admission.');
 let lease,key,values,scope,background,active=false,closed=false,epoch=0;
 const totals={previews:0,numericReads:0,backgroundReads:0,cacheHits:0,reclaims:0};
 const clear=()=>{key=values=scope=background=undefined;};
 async function retire({reclaimed=false}={}){epoch++;const old=lease;clear();if(reclaimed){lease=undefined;totals.reclaims++;}else if(old){await release(old);if(lease===old)lease=undefined;}}
 async function activate(signal){if(!lease||typeof updateReservation!=='function')return;const old=lease,result=await updateReservation(old,{bytes:old.bytes,idle:false});check(signal);if(result?.reclaimed||lease!==old){if(lease===old)await retire({reclaimed:true});}}
 async function park(){if(lease&&typeof updateReservation==='function'){const old=lease,result=await updateReservation(old,{bytes:old.bytes,idle:true});if(result?.reclaimed&&lease===old)await retire({reclaimed:true});}}
 return{
  async preview({output,params={},view={},plan,signal}={}){
   if(closed)fail('DISPOSED','Retained Ghost preview is closed.');if(active)fail('BUSY','Only one retained Ghost preview may run.');const c=ghostSurfacePreviewContract({output,params,view});if(!c)return null;const g=geometry(c,plan),started=performance.now();active=true;let primary;
   try{
    check(signal);await activate(signal);const next=JSON.stringify([c.sourceIdentity,c.quality,c.map.id,c.map.revision,c.scope.id,c.scope.revision,c.width,c.height,c.spatial?[c.spatial.roll,c.spatial.background.id,c.spatial.background.revision]:null,g.step,g.width,g.height]),hit=key===next&&values&&scope;
    if(!hit){
     await retire();check(signal);const bytes=g.pixels*(c.spatial?12:9)+4096+next.length*2;lease=await reserve({bytes,label:'retained-native-ghost-scalars'},{onReclaim:()=>retire({reclaimed:true})});const generation=epoch;check(signal);const sampled=new Float64Array(g.pixels),valid=new Uint8Array(g.pixels),span=(g.width-1)*g.step+1;
     if(c.spatial){
      if(typeof readSource!=='function')fail('INVALID_INPUT','Spatial Ghost preview needs its Original backdrop reader.');
      const frame=await readSource(c.spatial.background,{x:0,y:0,w:c.width,h:c.height,step:g.step});check(signal);if(frame?.format!=='rgb8'||frame.width!==g.width||frame.height!==g.height||!(frame.data instanceof Uint8Array)||frame.data.length!==g.pixels*3)fail('INVALID_RESULT','Ghost backdrop differs from the exact source sampling grid.');background=frame.data;totals.backgroundReads++;
      for(const context of c.spatial.contexts){let previousRow=-1,map,mask;const first=Math.max(0,Math.ceil(context.bounds[1]/g.step)),last=Math.min(g.height,Math.ceil(context.bounds[3]/g.step));for(let oy=first;oy<last;oy++){check(signal);const sy=(oy*g.step-context.bounds[1]+c.spatial.roll[1])%(context.bounds[3]-context.bounds[1]);if(sy>=context.rows*16)continue;const ay=context.atlasBounds[1]+Math.floor(sy/16);if(ay!==previousRow){const rect={x:context.atlasBounds[0],y:ay,width:context.columns,height:1},a=await readPlane(c.map,rect);check(signal);const b=await readMask(c.scope,rect);check(signal);map=a?.plane??a;mask=b?.mask??b;if(!(map?.data instanceof Float64Array)||map.width!==context.columns||map.height!==1||map.data.length!==context.columns||!(mask?.data instanceof Uint8Array)||mask.width!==context.columns||mask.height!==1||mask.data.length!==context.columns)fail('INVALID_RESULT','Native Ghost row changed type or geometry.');totals.numericReads+=2;previousRow=ay;}
       const left=Math.max(0,Math.ceil(context.bounds[0]/g.step)),right=Math.min(g.width,Math.ceil(context.bounds[2]/g.step));for(let ox=left;ox<right;ox++){const sx=(ox*g.step-context.bounds[0]+c.spatial.roll[0])%(context.bounds[2]-context.bounds[0]);if(sx>=context.columns*16)continue;const src=Math.floor(sx/16),dst=oy*g.width+ox,v=mask.data[src];if(v!==0&&v!==1)fail('INVALID_RESULT','Retained Ghost validity is not a native cell.');valid[dst]=v;if(v){if(!Number.isFinite(map.data[src]))fail('INVALID_RESULT','Native Ghost cell is not finite.');sampled[dst]=map.data[src];}}}
      }
     }else for(let row=0;row<g.height;){check(signal);const count=Math.min(g.height-row,Math.max(1,Math.floor((Math.floor(MAX_READ/span)-1)/g.step)+1)),rows=(count-1)*g.step+1,rect={x:0,y:row*g.step,width:span,height:rows},a=await readPlane(c.map,rect);check(signal);const b=await readMask(c.scope,rect);check(signal);const map=a?.plane??a,mask=b?.mask??b;
      if(!(map?.data instanceof Float64Array)||map.width!==span||map.height!==rows||map.data.length!==span*rows||!(mask?.data instanceof Uint8Array)||mask.width!==span||mask.height!==rows||mask.data.length!==span*rows)fail('INVALID_RESULT','Retained Ghost numeric transport changed its native type or geometry.');
      totals.numericReads+=2;for(let y=0;y<count;y++)for(let x=0;x<g.width;x++){const src=y*g.step*span+x*g.step,dst=(row+y)*g.width+x,v=mask.data[src];if(v!==0&&v!==1)fail('INVALID_RESULT','Retained Ghost validity is not an actual native cell.');valid[dst]=v;if(v){if(!Number.isFinite(map.data[src]))fail('INVALID_RESULT','Native Ghost cell is not finite.');sampled[dst]=map.data[src];}}row+=count;
     }
     check(signal);if(generation!==epoch||!lease)fail('CANCELLED','Retained Ghost sample ownership changed.');key=next;values=sampled;scope=valid;
    }else totals.cacheHits++;
    const data=c.spatial?background.slice():new Uint8Array(g.pixels*3),palette=GHOST_PALETTES[params.grayscale!==false?'gray':'viridis'],cooperate=createCooperator(signal);for(let y=0;y<g.height;y++){await cooperate();for(let x=0;x<g.width;x++){const i=y*g.width+x;if(scope[i]){const at=Math.max(0,Math.min(255,Math.floor(values[i]*256)))*3,dst=i*3;data[dst]=palette[at];data[dst+1]=palette[at+1];data[dst+2]=palette[at+2];}}}
    check(signal);totals.previews++;const milliseconds=performance.now()-started,feedback=adaptive.observe(plan,{milliseconds,pixels:g.pixels}),answer={pixels:{width:g.width,height:g.height,format:'rgb8',data,logicalWidth:c.width,logicalHeight:c.height,provisional:true},logicalWidth:c.width,logicalHeight:c.height,provisional:true,exact:false,approximate:true,metrics:{nativeAnalysisCalls:0,inferenceCalls:0,sourceReads:c.spatial&&!hit?1:0,presentationOnlyOriginalBackground:!!c.spatial,nativeQuality:c.quality,nativeScalarSamples:g.pixels,cacheHit:!!hit,...totals,adaptivePreview:{token:plan.token,milliseconds,setupMilliseconds:0,cold:false,pixels:g.pixels,feedback}}};await park();check(signal);return answer;
   }catch(error){primary=error;try{await retire();}catch(cleanup){if(Object.isExtensible(primary))primary.previewCleanupError={code:cleanup.code,message:cleanup.message};}throw primary;}
   finally{active=false;}
  },
  async dispose(){if(closed&&!lease)return;if(active)fail('BUSY','Retained Ghost preview must settle before disposal.');closed=true;await retire();},
  get state(){return{closed,active,cached:!!values,bytes:lease?.bytes??0,...totals};}
 };
}
