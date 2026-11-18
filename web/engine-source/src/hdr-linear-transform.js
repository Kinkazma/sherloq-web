// A typed linear HDR representation from the existing libavif gain tables.
// This stage neither decodes AV1 nor alters the Original source banks.
import {requireValue,checkAbort,createCooperator,EngineError} from './errors.js';
import {hdrGainMapWeight} from './hdr-color-presentation.js';
const f32=Math.fround;
const triple=(value,name)=>{requireValue(Array.isArray(value)&&value.length===3&&value.every(Number.isFinite),'Explicit finite gain '+name+' required.');return value;};
export function createHdrLinearModel({sourceModel,baseDepth,gainDepth,gainMap,targetHeadroom,mathPrimaries,sourceTransfer,maximumMemoryBytes}={}){
 requireValue(sourceModel instanceof Float32Array&&[8,10,12,16].includes(baseDepth)&&[8,10,12,16].includes(gainDepth)&&Number.isFinite(targetHeadroom)&&targetHeadroom>=0&&Number.isInteger(mathPrimaries)&&Number.isInteger(sourceTransfer),'Explicit original model, precision and HDR target required.');
 const baseCount=2**baseDepth,gainCount=2**gainDepth,baseAt=sourceModel[29],gainAt=sourceModel[30];
 requireValue(sourceModel.length>65536&&sourceModel[0]===baseCount-1&&sourceModel[1]===gainCount-1&&[baseAt,gainAt].every(Number.isSafeInteger)&&baseAt>=32&&gainAt>=baseAt+baseCount&&gainAt+gainCount*3<=sourceModel.length&&sourceModel[4]===0,'A native libavif CICP model before tone mapping is required.');
 requireValue(Number.isSafeInteger(maximumMemoryBytes)&&maximumMemoryBytes>=sourceModel.byteLength,'The HDR model copy needs its real admitted workspace.');
 const minimum=triple(gainMap?.minimum,'minimum'),maximum=triple(gainMap?.maximum,'maximum'),gamma=triple(gainMap?.gamma,'gamma');requireValue(gamma.every(v=>v>0),'Gain gamma must be positive.');
 const offsets=[...triple(gainMap.baseOffset,'baseOffset'),...triple(gainMap.alternateOffset,'alternateOffset')],weight=hdrGainMapWeight(gainMap,targetHeadroom),oldWeight=hdrGainMapWeight(gainMap,0);requireValue(sourceModel[2]===f32(oldWeight),'The existing model must describe its declared headroom0 projection.');
 const model=sourceModel.slice();model[2]=weight;
 if(weight===0){model.fill(0,23,29);model.fill(1,gainAt,gainAt+gainCount*3);}
 else{
  model.set(offsets,23);
  if(f32(weight)!==sourceModel[2])for(let c=0;c<3;c++)for(let i=0;i<gainCount;i++){
   // Same formula as pinned libavif gainmap.c. Inputs are the original parsed
   // rational metadata; the stored LUT deliberately retains float32 values.
   const fraction=i/(gainCount-1),log=(1-fraction**(1/gamma[c]))*minimum[c]+fraction**(1/gamma[c])*maximum[c];model[gainAt+c*gainCount+i]=2**(log*weight);
  }
 }
 // Float output remains in the gain-math RGB basis, before output-primary
 // conversion, tone mapping, gamut compression and transfer encoding.
 const metadata=Object.freeze({schema:'sherloq.hdr-linear/1',algorithm:'libavif-1.4.2-gain-linear-stage-v1',targetHeadroom,gainWeight:weight,sourceDepth:baseDepth,sampleType:'float32',sampleModel:'hdr-linear-rgb',mathPrimaries,transfer:'linear',outputSpace:'gain-map-math-linear-rgb',gainApplied:weight!==0,weightZeroEarlyExit:weight===0,sourceSamplesPreserved:true,preClamp:true,preToneMap:true,preGamutMap:true,valueEncoding:[16,18].includes(sourceTransfer)?{kind:'display-linear-relative',units:'libavif-extended-sdr',referenceWhiteNits:203,absoluteScaleSource:'libavif1.4.2 CICP PQ/HLG conversion convention'}:{kind:'linear-relative',units:'relative',referenceWhiteNits:null,absoluteScaleSource:null}});
 return{model,metadata,requiredModelBytes:model.byteLength};
}
/** The caller's codec phase funds source, model and outgoing float band until
 * its write/transfer ACK. No complete source/HDR bank is allocated here. */
export function createHdrLinearCpu({model,metadata,baseDepth,gainDepth,maximumPixels,maximumMemoryBytes}={}){
 requireValue(model instanceof Float32Array&&metadata?.preClamp===true&&Number.isSafeInteger(maximumPixels)&&maximumPixels>0&&Number.isSafeInteger(maximumMemoryBytes)&&model.byteLength+maximumPixels*12<=maximumMemoryBytes,'An admitted real HDR model/band owner is required.');
 const baseCount=2**baseDepth,gainCount=2**gainDepth,baseAt=model[29],gainAt=model[30],stride=model[3];let disposed=false,pending=Promise.resolve(),pixelsDone=0;
 return{metadata,requiredBytes:model.byteLength+maximumPixels*12,
  run(baseBytes,gainBytes,pixels,{signal}={}){
   const work=async()=>{checkAbort(signal);if(disposed)throw new EngineError('DISPOSED','HDR linear CPU owner is closed.');requireValue(Number.isSafeInteger(pixels)&&pixels>0&&pixels<=maximumPixels&&baseBytes instanceof Uint8Array&&gainBytes instanceof Uint8Array&&baseBytes.byteLength===pixels*3*(baseDepth>8?2:1)&&gainBytes.byteLength===pixels*3*(gainDepth>8?2:1),'The source/gain bands differ from the real declared precision.');
    const base=baseDepth>8?new Uint16Array(baseBytes.buffer,baseBytes.byteOffset,baseBytes.byteLength/2):baseBytes,gain=gainDepth>8?new Uint16Array(gainBytes.buffer,gainBytes.byteOffset,gainBytes.byteLength/2):gainBytes,out=new Float32Array(pixels*3),cooperate=createCooperator(signal);
    for(let i=0;i<out.length;i+=3){if(i%12288===0)await cooperate();requireValue((base[i]|base[i+1]|base[i+2])<baseCount&&(gain[i]|gain[i+1]|gain[i+2])<gainCount,'A decoded source/gain code exceeds its actual coded depth.');const r=model[baseAt+base[i]],g=model[baseAt+stride+base[i+1]],b=model[baseAt+2*stride+base[i+2]];
     for(let c=0;c<3;c++){const linear=model[5+c*3]*r+model[6+c*3]*g+model[7+c*3]*b,value=(linear+model[23+c])*model[gainAt+c*gainCount+gain[i+c]]-model[26+c];out[i+c]=value;if(!Number.isFinite(out[i+c]))throw new EngineError('COLOR_DOMAIN_UNSUPPORTED','The actual HDR reconstruction is outside finite Float32.');}
    }checkAbort(signal);pixelsDone+=pixels;return out;
   };const task=pending.then(work);pending=task.catch(()=>{});return task;
  },metrics(){return{backend:'cpu',pixelsDone,outputSampleType:'float32',maximumPixels};},async dispose(){disposed=true;await pending;model=null;}
 };
}
