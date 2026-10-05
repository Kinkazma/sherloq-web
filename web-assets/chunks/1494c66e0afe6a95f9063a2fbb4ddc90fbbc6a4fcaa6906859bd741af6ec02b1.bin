import "../../runtime-context.js?v=0.14.5";
import{requireValue,checkAbort}from'./errors.js';import{neuralResultSurfaces}from'./neural-result-surfaces.js';
export async function publishNeuralResult(analysis,imageId,provenance,{budget,publishResult,signal}){
 requireValue(typeof publishResult==='function','Common result-surface publisher required');let record;
 try{
  record=await neuralResultSurfaces(analysis,{budget});checkAbort(signal);for(const r of [record,...Object.values(record.planeRecords),...Object.values(record.maskRecords)])r.provenance=structuredClone(provenance);
  const bundle=publishResult(imageId,record),planes={map:bundle.surface,...bundle.planeSurfaces},masks=bundle.maskSurfaces;
  return{layout:'surface',...bundle,planeSurfaces:planes,data:record.data,layers:[{id:'probability',kind:'scalar',surfaceId:planes.map.id,width:analysis.width,height:analysis.height,origin:[0,0],range:[0,1]},...Object.entries(planes).filter(([key])=>key!=='map').map(([id,surface])=>({id,kind:'scalar',semantics:provenance.operation==='ai.clones.d2prl'?'Binary residual-sign role, not a probability':'Native class probability',surfaceId:surface.id,width:analysis.width,height:analysis.height,origin:[0,0],range:[0,1]})),...Object.entries(masks).map(([id,surface])=>({id:id==='mask'?'union':id,kind:'mask',surfaceId:surface.id,width:analysis.width,height:analysis.height,origin:[0,0],range:[0,1]}))]};
 }catch(error){if(record)await Promise.allSettled([record,...Object.values(record.planeRecords),...Object.values(record.maskRecords)].map(r=>r.surface.dispose()));throw error;}
}
