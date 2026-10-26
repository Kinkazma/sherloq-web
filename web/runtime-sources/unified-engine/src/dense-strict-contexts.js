import "../../runtime-context.js?v=0.25.0";
import {requireValue,checkAbort} from './errors.js';
// Search jobs retain the human acquisition identities. Descriptor preparation
// uses the exact admitted RGB rectangles separately; neither a search envelope
// nor an inherited acquisition can fill an excluded pixel in that bank.
export function strictDenseDefaultTask(task,domain,{signal}={}){
 checkAbort(signal);requireValue(task.operation==='tampering.copyMove.dense'&&task.sourceRegionLocalization?.domainFingerprint===domain.fingerprint&&task.sourceRegionLocalization?.coordinates==='source-region-native','Strict Dense defaults require verified localized coordinates.');
 const out={...task,params:structuredClone(task.params??{})};if(out.params.regions?.length)return out;
 let descriptor=domain.descriptor,selected;
 while(descriptor){const snapshot=descriptor.snapshot;if(snapshot.enabled&&snapshot.positiveMode==='selected'){selected=snapshot.zones.filter(z=>z.enabled&&z.kind==='acquisition').map(z=>z.polygon);break;}descriptor=descriptor.ceiling;}
 const polygons=(selected??[[[domain.origin[0],domain.origin[1]],[domain.origin[0]+domain.width,domain.origin[1]],[domain.origin[0]+domain.width,domain.origin[1]+domain.height],[domain.origin[0],domain.origin[1]+domain.height]]]).map(p=>p.map(([x,y])=>[x-domain.origin[0],y-domain.origin[1]])).filter(p=>Math.max(...p.map(v=>v[0]))>0&&Math.max(...p.map(v=>v[1]))>0&&Math.min(...p.map(v=>v[0]))<domain.width&&Math.min(...p.map(v=>v[1]))<domain.height);
 requireValue(polygons.length>0,'Strict Dense source has no intersecting acquisition.');requireValue(!out.params.compare||polygons.length===2,'Compare requires exactly two source acquisitions.');
 out.params.regions=structuredClone(polygons);if(!out.params.compare&&polygons.length>1)out.params.regions.push([[0,0],[domain.width,0],[domain.width,domain.height],[0,domain.height]]);
 if(!out.params.guides?.length&&!out.params.compare)out.params.guides=structuredClone(polygons);
 out.sourceRegionLocalization={...out.sourceRegionLocalization,policy:'Strict native RGB contexts from exact admitted pixels; independent source acquisition jobs plus explicit comparison envelope organize candidate search only. No excluded RGB or artificial padding image is supplied.'};return out;
}
