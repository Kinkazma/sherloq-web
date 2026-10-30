import {isPagedD2prlTensor} from './paged-feature-tensor.js';
import {requireValue,checkAbort,controlCheckpoint,EngineError} from '../../src/errors.js';
import {allocateOwnedTypedArray} from '../../src/allocation.js';
import {createWasmTensorArena} from '../../src/wasm-tensor-arena.js';

// A failed construction remains provider-owned. A fully sealed delivered tensor
// is an independent output loan and survives provider disposal, like a mapped
// convolution output. Publication has no await/callback after the handoff.
export function createD2prlPagedOutputHandoff(retirements,onOwner){
 let owner,record,published=false;
 return{
  adopt(value){requireValue(!owner&&!published&&value?.dispose&&value?.snapshot,'One pre-owned paged output required');owner=value;record={releaseSync(){if(!owner.snapshot().retired)throw new EngineError('GPU_RETIREMENT_PENDING','Paged convolution storage retirement requires its ACK');},release:()=>owner.dispose()};retirements.add(record);onOwner?.(owner);},
  publish(value){if(!owner)return;requireValue(!published&&value===owner&&owner.snapshot().sealed&&!owner.snapshot().closed,'Only the complete immutable output can be handed off');retirements.delete(record);published=true;},
  snapshot(){return{adopted:!!owner,published,providerDebt:record?retirements.has(record):false};}
 };
}

export function createD2prlSpatialOutputRegistry(){
 const records=new Set();
 return{
  createHandoff(onOwner){return createD2prlPagedOutputHandoff(records,onOwner);},
  async drain(){let failed=false,primary;for(const record of [...records])try{await record.release();records.delete(record);}catch(error){if(!failed){failed=true;primary=error;}}if(failed)throw primary;},
  drainSync(){let failed=false,primary;for(const record of [...records])try{record.releaseSync();records.delete(record);}catch(error){if(!failed){failed=true;primary=error;}}if(failed)throw primary;},
  snapshot(){return{pending:records.size};}
 };
}

export function createD2prlSpatialLifetime(){
 let active=false,closed=false,closing;
 return{
  enter(){requireValue(!active&&!closed,'Spatial convolution busy or closed');active=true;},
  leave(){active=false;},
  closeSync(work){requireValue(!active,'Spatial convolution busy');closed=true;return work();},
  closeAsync(work){requireValue(!active,'Spatial convolution busy');closed=true;if(closing)return closing;closing=Promise.resolve().then(work).finally(()=>{closing=null;});return closing;},
  snapshot(){return{active,closed,closing:!!closing};}
 };
}

export function d2prlSpatialConvolutionTileShape({ow,oh,window,localChannels,count,kernel,stride,nativeF2=false}){
   const side=Math.max(1,Math.floor(Math.sqrt(window/(4*Math.max(localChannels,count)))));
   const naturalTileW=Math.max(1,Math.min(ow,Math.floor((Math.min(1024,side)-kernel)/stride)+1));
   const tileW=nativeF2&&naturalTileW<ow?naturalTileW-naturalTileW%2:naturalTileW;
   requireValue(tileW>0,'Native CNN3 even tile width does not fit');
   const inputW=(tileW-1)*stride+kernel;
   const maxInputRows=Math.floor(window/(localChannels*inputW*4));
   const maxOutputRows=Math.floor(window/(count*tileW*4));
   const naturalTileH=Math.max(1,Math.min(oh,maxOutputRows,Math.floor((Math.min(1024,maxInputRows)-kernel)/stride)+1));
   const tileH=nativeF2&&naturalTileH<oh?naturalTileH-naturalTileH%2:naturalTileH;
   requireValue(tileH>0,'Native CNN3 even tile height does not fit');
 return{tileW,tileH,inputW};
}

// A transport window is chosen before its first halo or source read. The full
// destination already has its owner. Include the halo and the complete engine
// reservation, including a cold pipeline, without assuming a later eviction or
// refund. This is shape arithmetic; no shader, tensor or trial work is run.
export function d2prlFundedSpatialConvolutionTileShape(options,{availableBytes,weightBytes,biasBytes}){
 const {window:maximum,localChannels,count,kernel,stride}=options;
 requireValue(Number.isSafeInteger(maximum)&&maximum>0&&Number.isSafeInteger(availableBytes)&&availableBytes>=0&&[weightBytes,biasBytes].every(n=>Number.isSafeInteger(n)&&n>=0),'Exact spatial transport capacity required');
 let window=maximum;
 while(window>0){
  let tile;
  try{tile=d2prlSpatialConvolutionTileShape({...options,window});}
  catch(error){if(error?.code!=='INVALID_INPUT'||!/^Native CNN3 even tile (width|height) does not fit$/.test(error.message))throw error;break;}
  const {tileW,tileH,inputW}=tile,inputH=(tileH-1)*stride+kernel;
  const haloBytes=localChannels*inputW*inputH*4,outputBytes=count*tileW*tileH*4;
  const requiredBytes=3*haloBytes+2*(weightBytes+biasBytes)+3*outputBytes+2048+2*1024**2;
  if(requiredBytes<=availableBytes)return{...tile,window,requiredBytes};
  // Jump to the first byte that can change an actual tile dimension. Clamped
  // dimensions and the unused odd F2 dimension are skipped; otherwise a tiny
  // one-pixel tensor could require millions of irrelevant row-boundary visits.
  // Shapes can have nonmonotonic area, so do not binary-search their envelope.
  const boundaries=[];
  if(tileW>1)boundaries.push(4*Math.max(localChannels,count)*((tileW-1)*stride+kernel)**2-1);
  if(tileH>1)boundaries.push(localChannels*inputW*4*((tileH-1)*stride+kernel)-1,count*tileW*tileH*4-1);
  if(!boundaries.length)break;
  const next=Math.max(...boundaries);
  requireValue(Number.isSafeInteger(next)&&next<window,'Spatial capacity planning must advance');window=next;
 }
 throw new EngineError('MEMORY_LIMIT','One complete native convolution tile exceeds the remaining memory budget.',{details:{availableBytes,maximumWindowBytes:maximum,weightBytes,biasBytes}});
}

/** Transport decomposition of one convolution, retaining every input channel,
 * kernel tap, stride, padding value and output pixel. No neural context is split:
 * global operations above the convolution still consume the complete tensor. */
export async function runD2prlSpatialConvolution(input,{budget,arena,run,limits,inputSide,arithmetic='cpu'},{signal,onSubmitted,onRetirementOwner}={}){
 const {channels,height,width,outChannels,kernel,padding=0,stride=1,groups=1,hasBias=true}=input;
 requireValue([896,1344,1792].includes(inputSide)&&(input.input instanceof Float32Array||isPagedD2prlTensor(input.input)&&input.input.dtype==='float32')&&input.weights instanceof Float32Array&&input.bias instanceof Float32Array,'An explicit experimental D2PRL spatial configuration is required');
 requireValue([channels,height,width,outChannels,kernel,padding,stride,groups].every(Number.isSafeInteger)&&channels>0&&channels<=4096&&outChannels>0&&outChannels<=4096&&height>0&&width>0&&height<=8192&&width<=8192&&kernel>=1&&kernel<=13&&padding>=0&&padding<=6&&[1,2].includes(stride)&&groups>0&&channels%groups===0&&outChannels%groups===0,'Experimental convolution geometry differs');
 const oh=Math.floor((height+2*padding-kernel)/stride)+1,ow=Math.floor((width+2*padding-kernel)/stride)+1,groupIn=channels/groups,groupOut=outChannels/groups;
 requireValue(oh>0&&ow>0&&input.input.length===channels*height*width&&input.weights.length===outChannels*groupIn*kernel*kernel&&input.bias.length===outChannels,'Complete native convolution tensors required');
 const binding=Math.min(limits.maxStorageBufferBindingSize,limits.maxBufferSize),window=Math.min(binding,64*1024**2),weightRow=groupIn*kernel*kernel;
 const nativeF2=arithmetic==='mps'&&groups===1&&channels===64&&outChannels===128&&kernel===3&&padding===0&&stride===1&&hasBias&&/^(597|448|298)-cnn-3$/.test(input.referenceLayout?.name??'');
 let channelBlock=Math.min(outChannels,Math.floor(window/(weightRow*4)));
 if(groups>1)channelBlock=Math.floor(channelBlock/groupOut)*groupOut;
 requireValue(channelBlock>0,'A convolution group exceeds the GPU parameter binding');
 requireValue(!nativeF2||channelBlock===outChannels,'Native CNN3 complete output channels exceed the GPU parameter window');
 const paged=typeof input.pagedOutputFactory==='function';requireValue(!paged||typeof onRetirementOwner==='function','Paged convolution output must be adopted before asynchronous storage');
 let output,localArena,complete=false,failed=false,primary,tiles=0,stamp=performance.now();
 try{
  // N=4 contains complete activations over2GiB. The data-only Wasm page
  // allocator avoids a refused ordinary ArrayBuffer without splitting the
  // mathematical tensor or changing any of its values. Its owner stays live
  // until the returned result is released.
  if(paged){output=input.pagedOutputFactory([1,outChannels,oh,ow],'float32');requireValue(isPagedD2prlTensor(output),'Synchronous owned Native paged tensor required');onRetirementOwner(output);await output.initialize({signal});}
  else if(inputSide===1792){const destination=arena??(localArena=createWasmTensorArena({budget,maximumTensorBytes:2**32}));output=destination.allocate(Float32Array,outChannels*oh*ow,{signal,zero:false,label:'experimental-spatial-convolution-output'});}
  else output=allocateOwnedTypedArray(Float32Array,outChannels*oh*ow,{budget,owner:'d2prl',label:'experimental-spatial-convolution-output'});
  for(let first=0;first<outChannels;first+=channelBlock){
   checkAbort(signal);const count=Math.min(channelBlock,outChannels-first),firstGroup=groups>1?first/groupOut:0,localGroups=groups>1?count/groupOut:1,localChannels=groups>1?localGroups*groupIn:channels;
   const weight=input.weights.subarray(first*weightRow,(first+count)*weightRow),bias=input.bias.subarray(first,first+count);
   // Both source and destination windows remain bounded, even when a complete
   // N=4 activation is larger than a WebGPU storage binding.
   const tileOptions={ow,oh,window,localChannels,count,kernel,stride,nativeF2};
   const {tileW,tileH,inputW}=(inputSide===896&&budget.limit<8*1024**3||inputSide===1344&&budget.limit<=2*1024**3)?d2prlFundedSpatialConvolutionTileShape(tileOptions,{availableBytes:Math.max(0,budget.limit-budget.total()),weightBytes:weight.byteLength,biasBytes:bias.byteLength}):d2prlSpatialConvolutionTileShape(tileOptions);
   requireValue(inputW<=1024&&(tileH-1)*stride+kernel<=1024&&localChannels*inputW*((tileH-1)*stride+kernel)*4<=binding&&count*tileW*tileH*4<=binding,'A native convolution window exceeds the device binding');
   for(let top=0;top<oh;top+=tileH)for(let left=0;left<ow;left+=tileW){
    checkAbort(signal);const h=Math.min(tileH,oh-top),w=Math.min(tileW,ow-left),ih=(h-1)*stride+kernel,iw=(w-1)*stride+kernel,originX=left*stride-padding,originY=top*stride-padding;
    const owned=allocateOwnedTypedArray(Float32Array,localChannels*ih*iw,{budget,owner:'d2prl',label:'experimental-spatial-convolution-halo'});let result,tileFailed=false,tilePrimary;
    try{
     // Fresh zeroed halo retains the original constant padding. Every in-domain
     // source value is copied exactly; no image rescaling or approximate halo.
     owned.data.fill(0);
     if(isPagedD2prlTensor(input.input)){await input.input.readIntoRectangle(owned.data,{channel:firstGroup*groupIn,channels:localChannels,x:originX,y:originY,width:iw,height:ih},{signal});}
     else for(let c=0;c<localChannels;c++)for(let y=0;y<ih;y++){
      const globalY=originY+y;if(globalY<0||globalY>=height)continue;
      const begin=Math.max(0,originX),end=Math.min(width,originX+iw);if(end<=begin)continue;
      const source=((firstGroup*groupIn+c)*height+globalY)*width+begin;
      owned.data.set(input.input.subarray(source,source+end-begin),(c*ih+y)*iw+begin-originX);
     }
     const layout={...(input.referenceLayout?.name?{name:input.referenceLayout.name}:{}),inputShape:[1,localChannels,ih,iw],weightShape:[count,localChannels/localGroups,kernel,kernel],padding:0,stride,groups:localGroups,biasAfterRanges:[[0,h*w]]};
     result=await run({input:owned.data,weights:weight,bias,channels:localChannels,height:ih,width:iw,outChannels:count,kernel,padding:0,stride,groups:localGroups,hasBias,referenceLayout:layout,experimentalTailStart:h*w},{signal,onSubmitted});
     requireValue(result.shape[2]===h&&result.shape[3]===w,'Convolution transport window changed its native output grid');
     if(paged)await output.writeRectangle(result.data,{channel:first,channels:count,x:left,y:top,width:w,height:h},{signal});
     else for(let c=0;c<count;c++)for(let y=0;y<h;y++)output.data.set(result.data.subarray((c*h+y)*w,(c*h+y+1)*w),((first+c)*oh+top+y)*ow+left);
     tiles++;
    }catch(error){tileFailed=true;tilePrimary=error;throw error;}finally{let cleanupFailed=false,cleanupPrimary;for(const close of[()=>result?.release(),()=>owned.release()])try{await close();}catch(error){if(!cleanupFailed){cleanupFailed=true;cleanupPrimary=error;}}if(cleanupFailed){if(!tileFailed)throw cleanupPrimary;if(tilePrimary&&typeof tilePrimary==='object'&&Object.isExtensible(tilePrimary))try{tilePrimary.details={...tilePrimary.details,convolutionTransportCleanup:cleanupPrimary};}catch{}}}
    if(performance.now()-stamp>=8){await controlCheckpoint(signal);stamp=performance.now();}
   }
  }
  checkAbort(signal);if(paged){await output.seal({signal});checkAbort(signal);complete=true;return output;}complete=true;return{get data(){return output.data;},release:output.release,shape:[1,outChannels,oh,ow],arithmeticQualification:'experimental-spatial-multiple-bias-after',execution:{inputSide,transportTiles:tiles,kernelOrder:arithmetic==='mps'?'mps-candidate-ky-kx-ic-ordered-FMA':'cpu-ic-ky-kx-ordered-FMA',padding:'original-zero-halo',globalNeuralContext:'unchanged',outputBacking:inputSide===1792?'owned-wasm-memory':'owned-array-buffer',...(nativeF2?{nativeTransformTileParity:2,referenceLayoutName:input.referenceLayout.name}:{})}};
 }catch(error){failed=true;primary=error;throw error;}finally{let cleanupFailed=false,cleanupPrimary;for(const close of[()=>!complete?output?.release():undefined,()=>localArena?.dispose()])try{await close();}catch(error){if(!cleanupFailed){cleanupFailed=true;cleanupPrimary=error;}}if(cleanupFailed){if(!failed)throw cleanupPrimary;if(primary&&typeof primary==='object'&&Object.isExtensible(primary))try{primary.details={...primary.details,convolutionTransportCleanup:cleanupPrimary};}catch{}}}
}
