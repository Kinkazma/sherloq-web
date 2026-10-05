import "../../runtime-context.js?v=0.14.5";
import{requireValue}from'./errors.js';import{streamScientificNpz}from'./scientific-npz-stream.js';
export function streamNeuralNpz(analysis,provenance,request,hooks){
 requireValue(analysis?.stores&&analysis.metadata&&['ai.clones.d2prl','ai.clones.segmentation'].includes(provenance?.operation),'Live neural scientific result required');
 const keys=provenance.operation==='ai.clones.d2prl'?['map','mask','target','source','analyzed','candidates']:['map','mask','analyzed','candidates',...(analysis.stores.target?['target','source']:[])],n=analysis.width*analysis.height;
 const arrays=keys.map(key=>{const floating=['map','target','source'].includes(key),store=analysis.stores[key],elementBytes=floating?4:1;requireValue(store?.byteLength===n*elementBytes,'Neural scientific store geometry');return{key,descr:floating?'<f4':'|u1',shape:[analysis.height,analysis.width],count:n,elementBytes,read:(bytes,first)=>store.readInto(bytes,first*elementBytes)};});
 return streamScientificNpz(arrays,analysis.metadata,provenance,request,hooks);
}
