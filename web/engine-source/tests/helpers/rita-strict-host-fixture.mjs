import {createEngine} from '../../src/index.js';
import {createM2WorkerHost} from '../../src/m2-worker-host.js';
import {withM2NativeSourceTransport} from '../../src/m2-native-source-client.js';
import {createOriginalSourceRegionsState,compileOriginalSourceRegions} from '../../src/source-region-geometry.js';
import {createRitaSourceRegionRouter} from '../../src/rita-source-region-router.js';
import {deserializeEngineError} from '../../src/errors.js';
import {controlledRitaNative} from './rita-strict-fixture.mjs';

/** Actual Core API, named source derivation, MessageChannel source transport,
 * M2 structured-clone protocol and unchanged native RITA control flow. Only
 * graph outputs are controlled. This is not model or user-gesture proof. */
export async function ritaStrictHostFixture(){
 const engine=createEngine({memoryBudgetBytes:128*1024**2,cpuKernel:'reference'}),width=23,height=17,rgb=Uint8Array.from({length:width*height*3},(_,i)=>(i*31+17)%256),source=await engine.load({id:'original',bytes:Uint8Array.of(1,2,3),pixels:{width,height,format:'rgb8',data:rgb}}),state=await createOriginalSourceRegionsState({sourceSha256:source.sha256,width,height});
 await state.add('acquisition',{x0:2,y0:3,x1:8,y1:10});await state.add('acquisition',{x0:12,y0:4,x1:20,y1:15});await state.add('exclusion',{x0:4,y0:5,x1:5,y1:6});const domain=await compileOriginalSourceRegions(state.snapshot()),pending=new Map(),natives=[];let serial=0,closed=false;
 const host=createM2WorkerHost({post(message,transfer=[]){const answer=structuredClone(message,{transfer});if(answer.progress)return;const job=pending.get(answer.id);if(!job)return;pending.delete(answer.id);answer.error?job.reject(deserializeEngineError(answer.error)):job.resolve(answer.value);},analyzerFactories:{rita:configuration=>createRitaSourceRegionRouter({...configuration,nativeFactory:({budget})=>{const native=controlledRitaNative(budget);natives.push(native);return native.api;}})}});
 function rpc(operation,args={},transfer=[]){const id=++serial;return new Promise((resolve,reject)=>{pending.set(id,{resolve,reject});const message=structuredClone({id,operation,args},{transfer});host.handle(message).catch(reject);});}
 await rpc('initialize',{computeProfile:'maximum',memoryBudgetBytes:128*1024**2,methods:{rita:{}}});
 const base={analyzeNativeSource:(method,image,params,options)=>rpc('analyzeNativeSource',{method,image,params,backend:options.backend},[image.port]),release:id=>rpc('releaseResult',{resultId:id}),dispose:()=>rpc('dispose')},client=withM2NativeSourceTransport(base);
 async function reader(){const input=await engine.deriveSourceRegionInput({imageId:source.id,sourceRegionDomain:domain.descriptor,purpose:'analysis-native-contexts',scientificConsumer:'m2.rita'});let disposed=false;return{width:input.width,height:input.height,format:'rgb8',sha256:source.sha256,origin:input.sourceRegionOrigin,sourceRegionDomain:input.sourceRegionDomain,purpose:'analysis-native-contexts',analysisContext:input.analysisContext,sourceRegionSourceSurface:input.sourceRegionSourceSurface,async readWindow(rect){const answer=await engine.readPixels({surfaceId:input.sourceRegionSourceSurface.id,revision:input.sourceRegionSourceSurface.revision,rect});return{pixels:answer.pixels,release(){}};},async dispose(){if(disposed)return;disposed=true;await engine.releaseSurface(input.sourceRegionSourceSurface.id);}};}
 return{engine,source,rgb,domain,natives,rpc,client,async analyze(){return client.analyzeNativeContexts('rita',await reader(),{},{backend:'cpu'});},async metadata(descriptor){const bytes=await rpc('readMetadata',{resultId:descriptor.id,offset:0,count:descriptor.metadataBytes});return JSON.parse(new TextDecoder().decode(bytes));},async read(descriptor,field,offset,count){return rpc('readArray',{resultId:descriptor.id,field,offset,count});},async close(){if(closed)return;closed=true;await client.dispose();await engine.unload(source.id);const memory=engine.capabilities().memory;await engine.dispose();return memory;}};
}
