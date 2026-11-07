import {RECOMPRESSION_FORMATS} from './unified-engine/src/recompression-plan.js';
/** Labels describe the completed result, never the current menu selection. */
export function recompressionAxisLabel(output,language='fr',data=output?.data){
 const fr=language!=='en',provenance=output?.provenance??{},native=data?.recompressionPlan?data:data?.fragments?.find(value=>value.evaluable&&value.data?.recompressionPlan)?.data??data;
 const plan=native?.recompressionPlan??output?.metrics?.recompressionPlan??provenance.recompressionPlan??output?.preview?.recompressionPlan,selection=provenance.params?.recompression;
 const codec=plan?.stage?.codec??provenance.recompression?.codec??(selection?.codec!=='source'?selection?.codec:null),lossless=plan?.stage?.lossless??selection?.lossless;
 if(!codec)return selection?(fr?'Niveau de recompression':'Recompression level'):(fr?'Qualité JPEG':'JPEG quality');
 const format=RECOMPRESSION_FORMATS.find(value=>value.id===codec),palette=!lossless&&(plan?.stage?.qualityKind==='palette-colors'||format?.qualityKind==='palette-colors');
 if(palette)return 'Palette (%)';
 if(lossless||format?.qualityMeaningful===false)return fr?'Niveau de recompression':'Recompression level';
 const label=format?.label??codec.toUpperCase();return fr?'Qualité '+label:label+' quality';
}
