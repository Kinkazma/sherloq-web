import test from 'node:test';
import {createEngine} from '../src/index.js';
import {createOriginalSourceRegionsState,compileOriginalSourceRegions} from '../src/source-region-geometry.js';
import {XFEAT_PAGED_MODEL} from '../src/xfeat-paged-assets.js';import {ALIKED_MODELS} from '../src/aliked-assets.js';import {SPARSE_GLUE_PAGED_MODELS} from '../src/sparse-glue-paged-assets.js';
const methods=['XFeat','XFeat + LighterGlue','ALIKED','ALIKED rotation','ALIKED + LightGlue','ALIKED rotation + LightGlue','SIFT + LightGlue','EfficientLoFTR'],check=(v,m)=>{if(!v)throw Error(m);};
test('actual Core/M3 registrations publish both requested modes for empty declared windows without graph input/runtime/model work',async()=>{
 const engine=createEngine({computeProfile:'maximum'}),models={'xfeat-paged':{sha256:XFEAT_PAGED_MODEL.sha256,data:Uint8Array.of(0)}};
 // Intentional placeholders: every admitted window is empty. Any attempt to
 // use these bytes as a model is a test failure, never controlled inference.
 for(const kind of ['aliked-n16','aliked-n16rot'])models[kind]={graphs:Object.fromEntries(Object.entries(ALIKED_MODELS[kind].graphs).map(([name,id])=>[name,{sha256:id.sha256,data:Uint8Array.of(0)}]))};
 for(const kind of ['xfeat','aliked','sift'])models[kind+'-glue-paged']={sha256:SPARSE_GLUE_PAGED_MODELS[kind].sha256,data:Uint8Array.of(0)};
 try{await engine.loadM3Models({models});const image=await engine.load({id:'Original',bytes:Uint8Array.of(80,1),pixels:{format:'rgb8',width:96,height:96,data:new Uint8Array(96*96*3)}}),receipts=[],state=await createOriginalSourceRegionsState({sourceSha256:image.sha256,width:96,height:96});await state.add('acquisition',{bounds:[0,0,32,96]});const domain=await compileOriginalSourceRegions(state.snapshot());
  for(const algorithm of methods)for(const cloneWindowMode of ['independent','global']){
   const params={algorithm,...(algorithm==='EfficientLoFTR'?{regions:[[[0,0],[31,0],[31,31],[0,31]],[[48,48],[79,48],[79,79],[48,79]]]}:{})},task={id:algorithm+'/'+cloneWindowMode,imageId:image.id,operation:'tampering.copyMove.sparse',backend:'webgpu',cloneWindowMode,params,sourceRegionDomain:domain.descriptor,regions:[{id:'empty-arbitrary-id',bounds:[64,0,96,96]}]},out=await engine.run(task);
   check(out.status==='no-regions','Empty acquisition reached a native model or whole fallback');check(out.cloneWindowMode===cloneWindowMode&&out.provenance.cloneWindowMode===cloneWindowMode,'Real M3 lost its actual empty planning mode');check(cloneWindowMode==='global'?out.data.metadata.qualificationScope==='empty-no-native-execution':out.data.windowResults.every(w=>w.status==='empty'&&w.dataNatif===null),'Empty planning carried a native result');check(out.data.points.length===0&&out.data.pairs.length===0,'Empty windows produced native candidates');check(JSON.stringify(out.provenance.params)===JSON.stringify(params),'M3 rewrote the requested parameters');receipts.push({algorithm,cloneWindowMode,status:out.status});
  }return{actualCoreM3Routes:receipts,nativeForwards:0,modelBytesAreDeliberateInvalidPlaceholders:true};
 }finally{await engine.unload('Original');await engine.dispose();}
});
