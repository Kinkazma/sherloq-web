import {fixture,models} from './selfdm-proposal-parent-fixture.mjs';
import {createSelfDMProposalWindowRun} from '../src/selfdm-proposal-window-run.js';
import {createSelfDMProposalWindowProduct} from '../src/selfdm-proposal-window-product.js';
import {SEGMENTATION_MODELS} from '../experiments/segmentation/models.js';
const MODEL=SEGMENTATION_MODELS['selfdm-proposal'];
export async function setup({maximumCores=10}={}){const f=await fixture(),records=new Map(),bundles=[];let nativeRuns=0,bundleLoads=0;
 const product=createSelfDMProposalWindowProduct({budget:f.budget,profile:{id:'maximum',maxWorkers:maximumCores},version:'controlled-no-NN',runFactory(input,options){nativeRuns++;return createSelfDMProposalWindowRun(input,{...f.deps,...options})},async bundleLoader(){bundleLoads++;return{models,cv:undefined}},publishResult(imageId,record){const surface=record.surface.descriptor,maskSurfaces=Object.fromEntries(Object.entries(record.maskRecords).map(([key,value])=>[key,value.surface.descriptor]));records.set(surface.id,record);for(const value of Object.values(record.maskRecords))records.set(value.surface.descriptor.id,value);const bundle={surface,maskSurfaces};bundles.push(bundle);return bundle},async releaseSurface(id){const record=records.get(id);if(!record)return;await record.surface.dispose();records.delete(id)}});
 const input=(id='job-A',mode='independent',fingerprint=f.window.fingerprint)=>({task:{id,imageId:'image',operation:'ai.clones.segmentation',backend:'auto',cloneWindowMode:mode,params:{variant:'selfdm-proposal'}},original:{sha256:f.source.sha256,surface:f.source},window:{...f.window,fingerprint},backend:'auto',mode,config:{variant:'selfdm-proposal',bytes:MODEL.bytes,sha256:MODEL.sha256,url:'https://native.invalid/manifest.json'},plan:{contextDomain:f.domain,candidateDomain:f.domain,frame:[f.domain.origin[0],f.domain.origin[1],f.domain.origin[0]+f.domain.width,f.domain.origin[1]+f.domain.height]}});
 async function releaseSurfaces(){for(const[id,record]of [...records]){await record.surface.dispose();records.delete(id)}}
 return{f,product,input,records,bundles,state:()=>({nativeRuns,bundleLoads}),releaseSurfaces};
}
