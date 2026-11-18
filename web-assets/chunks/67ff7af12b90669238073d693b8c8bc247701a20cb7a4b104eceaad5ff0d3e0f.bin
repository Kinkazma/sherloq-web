import "../../runtime-context.js?v=0.33.2";
import {EngineError,requireValue,checkAbort} from './errors.js';
import {allocateOwnedTypedArray} from './allocation.js';
import {createRgb16Bank} from './rgb16-surface.js';
import {compileOriginalSourceRegions} from './source-region-geometry.js';
import {sourceRegionTransportBytes} from './source-region-transport.js';
import {parameterRegionGrid,parameterRegionMembership,parameterRegionDerivedDomain} from './source-region-preview-grid.js';
import {withRetirementOwner} from './owner-retirement-error.js';
const littleEndian=new Uint8Array(new Uint16Array([1]).buffer)[0]===1;
const ack=async action=>{const result=await action?.();if(result===false||result===0)throw new EngineError('RETIREMENT_NACK','Regional preview retirement was not acknowledged.');return result;};
const owned=(Type,n,budget,label)=>allocateOwnedTypedArray(Type,n,{budget,owner:'native16-region-preview',label});
function validateOriginal(original,presentation,domain,binding){
 const d=original?.descriptor,p=presentation?.descriptor;
 requireValue(d?.format==='rgb16'&&d.depth===16&&p?.format==='rgb8'&&p.width===d.width&&p.height===d.height,'Regional proxy requires native Original and its distinct canonical SDR presentation.');
 requireValue(domain&&!domain.empty&&domain.sourceWidth===d.width&&domain.sourceHeight===d.height&&domain.sourceSha256===binding?.sourceSha256&&binding.nativeSurfaceId===d.id&&binding.nativeRevision===d.revision,'Regional proxy has another Original authority.');
}
/** Each staging/destination credit stays behind the ACK of any Source loan.
 * A failed retirement is exposed, never retried in its own failing call. */
function resources(original){
 let loan,child,row,bytes,mask,bank,fee,disposed=false,flight;
 const owner={
  get bank(){return bank;},set bank(value){bank=value;},get row(){return row;},set row(value){row=value;},get mask(){return mask;},set mask(value){mask=value;},get bytes(){return bytes;},set bytes(value){bytes=value;},set fee(value){fee=value;},
  set loan(value){loan=value;},get loan(){return loan;},
  async releaseLoan(){if(!loan)return;await ack(()=>loan.release());loan=null;},
  capture(error){const value=error?.cleanupOwner;if(value&&value!==owner){requireValue(value!==original,'A regional loan cannot retire its Original source.');child=value;}return error;},
  async fail(error){owner.capture(error);if(child||loan)throw withRetirementOwner(error,owner,error);try{await owner.dispose();}catch(cleanup){throw withRetirementOwner(error,owner,cleanup);}throw error;},
  dispose(){if(disposed)return Promise.resolve();if(flight)return flight;const task=(async()=>{
   if(child){const prior=child;await ack(()=>prior.dispose());if(child===prior)child=null;}
   await owner.releaseLoan();
   if(bank){await ack(()=>bank.dispose());bank=null;}
   row?.release();row=null;bytes?.release();bytes=null;mask?.release();mask=null;
   if(fee){await ack(fee);fee=null;}disposed=true;
  })();flight=task;void task.finally(()=>{if(flight===task)flight=null;}).catch(()=>{});return task;}
 };return owner;
}
/** Same literal lattice and membership as the established RGB8 sampler. The
 * bank contains UInt16 words; missing slots are masked, never observations. */
export async function createNative16RegionPreviewGrid({original,presentation,domain,step,budget,image,sourceBinding,isSourceCurrent,signal}={}){
 validateOriginal(original,presentation,domain,sourceBinding);const d=original.descriptor,plan=parameterRegionGrid(domain,step),owner=resources(original),started=performance.now();
 const current=()=>{checkAbort(signal);if(!isSourceCurrent?.())throw new EngineError('SOURCE_CHANGED','Regional preview Original changed.');};
 let numericDomain=domain,surface=original,sourceReads=0;
 try{
  current();owner.fee=budget.reserve(sourceRegionTransportBytes(domain.descriptor,{allowAliases:true})*4+65536+(step>1?plan.metadataBytes:0));
  if(step>1){
   owner.mask=owned(Uint8Array,plan.pixels,budget,'native16-region-membership');
   const membership=parameterRegionMembership(domain,plan,{target:owner.mask.data});
   const derived=await parameterRegionDerivedDomain({...plan,membership:membership.mask,rectangles:membership.rectangles,included:membership.included},domain.sourceSha256);current();numericDomain=await compileOriginalSourceRegions(derived);current();
   owner.bank=await createRgb16Bank({width:plan.width,height:plan.height,budget,sourceDepth:d.sourceDepth,color:d.color,provenance:{...d.provenance,sampledNative16:{parentSurfaceId:d.id,parentRevision:d.revision,step,origin:[...domain.origin],originalDomainFingerprint:domain.fingerprint,derivedDomainFingerprint:numericDomain.fingerprint}},temporarySession:image?.session,getTemporarySession:image?.ensureTemporarySession,signal});
   owner.row=owned(Uint16Array,plan.width*3,budget,'native16-region-row');
   if(!littleEndian)owner.bytes=owned(Uint8Array,plan.width*6,budget,'native16-region-little-endian-row');
   for(let y=0;y<plan.height;y++){
    current();owner.row.data.fill(0);
    for(const[a,b]of domain.rowIntervals(y*step)){
     const x0=Math.max(0,Math.ceil(a/step)),x1=Math.min(plan.width,Math.ceil(b/step));if(x1<=x0)continue;
     current();owner.loan=await original.readNativeSampledWindow({x:domain.origin[0]+x0*step,y:domain.origin[1]+y*step,w:(x1-x0-1)*step+1,h:1,step},{signal});current();const p=owner.loan.pixels;
     requireValue(p?.format==='rgb16'&&p.data instanceof Uint16Array&&p.width===x1-x0&&p.height===1&&p.data.length===p.width*3,'Regional native source returned another literal grid.');
     owner.row.data.set(p.data,x0*3);await owner.releaseLoan();sourceReads++;
    }
    let data=new Uint8Array(owner.row.data.buffer,owner.row.data.byteOffset,owner.row.data.byteLength);
    if(owner.bytes){const view=new DataView(owner.bytes.data.buffer);for(let i=0;i<owner.row.data.length;i++)view.setUint16(i*2,owner.row.data[i],true);data=owner.bytes.data;}
    await owner.bank.writeBand({y,rows:1,data},{signal});
   }
   surface=await owner.bank.seal({signal});current();owner.bank.store.markCold?.(true);owner.row.release();owner.row=null;owner.bytes?.release();owner.bytes=null;
  }
  const frameOrigin=step===1?[...domain.origin]:[0,0],background=createRegionPresentationGrid(presentation,plan,{isSourceCurrent});
  const sampling=Object.freeze({schema:plan.schema,parentFingerprint:domain.fingerprint,derivedFingerprint:numericDomain.fingerprint,origin:Object.freeze([...plan.origin]),step,width:plan.width,height:plan.height,includedSamples:step===1?domain.countIncluded:numericDomain.countIncluded,missingSamples:plan.pixels-(step===1?domain.countIncluded:numericDomain.countIncluded),sourceReads,nativeSurfaceId:d.id,nativeRevision:d.revision,sourceSha256:domain.sourceSha256});
  return{surface,bank:owner.bank,step,owner,domain:numericDomain,originalFingerprint:domain.fingerprint,presentationSurface:step===1?presentation:background,presentationDomain:numericDomain,sourceRegionSampling:sampling,width:plan.width,height:plan.height,setupMilliseconds:performance.now()-started,
   readPreviewWindow({signal,surface:output}={}){return readRegionPreviewFrame({surface:output,domain:numericDomain,frameOrigin,width:plan.width,height:plan.height,background,budget,isSourceCurrent,signal});},dispose:()=>owner.dispose()};
 }catch(error){return owner.fail(error);}
}
/** Canonical display is sampled independently and cannot enter native maths. */
function createRegionPresentationGrid(source,plan,{isSourceCurrent}){
 const d=source.descriptor,descriptor=Object.freeze({...d,id:d.id+'/region-grid/'+plan.parentFingerprint+'/'+plan.step,revision:d.revision,width:plan.width,height:plan.height,format:'rgb8'});
 return{descriptor,async readWindow({x=0,y=0,width=plan.width,height=plan.height}={},options={}){
  checkAbort(options.signal);requireValue([x,y,width,height].every(Number.isSafeInteger)&&x>=0&&y>=0&&width>0&&height>0&&x<=plan.width-width&&y<=plan.height-height,'Regional display window is outside its grid.');
  if(!isSourceCurrent?.())throw new EngineError('SOURCE_CHANGED','Regional display Original changed.');
  const frame=await source.readSampledWindow({x:plan.origin[0]+x*plan.step,y:plan.origin[1]+y*plan.step,w:(width-1)*plan.step+1,h:(height-1)*plan.step+1,step:plan.step},options);
  // The frame is still a loan from canonical SDR. Its ACK, origin and metrics
  // are not replaced by a Source owner or a synthetic display allocation.
  return frame;
 }};
}
/** Pad only presentation when sampled membership leaves an empty outer row.
 * The optional surface is the already post-equalized crop on the same domain. */
async function readRegionPreviewFrame({surface,domain,frameOrigin,width,height,background,budget,isSourceCurrent,signal}){
 const d=surface?.descriptor,x=domain.origin[0]-frameOrigin[0],y=domain.origin[1]-frameOrigin[1];
 requireValue(d?.format==='rgb8'&&d.width===domain.width&&d.height===domain.height&&x>=0&&y>=0&&x+d.width<=width&&y+d.height<=height,'Regional preview result lost its numeric coordinate frame.');
 const current=()=>{checkAbort(signal);if(!isSourceCurrent?.())throw new EngineError('SOURCE_CHANGED','Regional preview frame Original changed.');};current();
 if(x===0&&y===0&&d.width===width&&d.height===height)return surface.readWindow({x:0,y:0,width,height},{signal});
 const owner=resources(),out=owned(Uint8Array,width*height*3,budget,'native16-region-display-frame');owner.row=out;
 try{
  for(let row=0;row<height;row++){
   current();owner.loan=await background.readWindow({x:0,y:row,width,height:1},{signal});current();let p=owner.loan.pixels;requireValue(p?.format==='rgb8'&&p.data instanceof Uint8Array&&p.data.length===width*3,'Regional canonical background returned another grid.');out.data.set(p.data,row*width*3);await owner.releaseLoan();
   if(row>=y&&row<y+d.height){owner.loan=await surface.readWindow({x:0,y:row-y,width:d.width,height:1},{signal});current();p=owner.loan.pixels;requireValue(p?.format==='rgb8'&&p.data instanceof Uint8Array&&p.data.length===d.width*3,'Regional output returned another crop.');out.data.set(p.data,(row*width+x)*3);await owner.releaseLoan();}
  }
  current();return{pixels:{width,height,format:'rgb8',data:out.data},origin:[0,0],release:()=>owner.dispose(),metrics:{regionalDisplayPadding:true,presentationPrecision:8}};
 }catch(error){return owner.fail(error);}
}
