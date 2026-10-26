import "../../runtime-context.js?v=0.25.0";
import {createAlikedStrictOwner} from './aliked-strict-owner.js';
import {planAlikedStrictContexts} from './aliked-strict-contexts.js';
import {createAlikedStrictNativeStages} from './aliked-strict-native-stages.js';
import {createAlikedNativeSelector} from './aliked-strict-selector.js';
import {selectAlikedCommonPopulation} from './aliked-strict-population.js';
import {buildAlikedGlobalBank} from './aliked-strict-bank.js';
import {checkAbort,requireValue} from './errors.js';
/** Actual stages compose one native population/bank. No matching happens here.
 * Returned bank lives until this published owner is disposed. A caller must
 * capture both outer and child owners before their construction can await. */
export function extractAlikedStrictNative(view,{budget,onOwner,signal,coverage:givenCoverage,limit=6000,zoneCount=1,membership,allowedAtSource,onPopulationWitness,wasmBinary,...native}={}){
 const owner=createAlikedStrictOwner({signal,onOwner});return owner.run(async()=>{const coverage=givenCoverage??await planAlikedStrictContexts(view,{budget,signal:owner.signal});if(!givenCoverage)owner.own(()=>coverage.dispose(),'native context coverage');const stages=createAlikedStrictNativeStages({...native,coverage,budget,signal:owner.signal,onOwner:o=>owner.own(()=>o.dispose(),'all native ALIKED stages')}),arena=stages.budget;const raw=await stages.collect(view,{wasmBinary});checkAbort(owner.signal);
  const cells=coverage.preservedRectangle?Math.max(1,...coverage.contexts.map(c=>c.preparedWidth*c.preparedHeight)):5*coverage.contexts.reduce((n,c)=>n+c.preparedWidth*c.preparedHeight,0)+20,selector=await createAlikedNativeSelector({budget:arena,maximumCells:cells,signal:owner.signal,wasmBinary});stages.owner.credit(()=>selector.dispose());const population=await selectAlikedCommonPopulation(coverage,raw,{budget:arena,selector,meanReducer:p=>stages.meanReducer(p),allowedAtSource,signal:owner.signal,onMeanPopulation:p=>onPopulationWitness?.({phase:'owned-mean-input',population:p})});stages.owner.credit(()=>population.dispose());await onPopulationWitness?.({phase:'native-common-selection',population});
  const bank=await buildAlikedGlobalBank(population,{budget:arena,limit,zoneCount,localize:(...a)=>stages.localize(...a),describe:(...a)=>stages.describe(...a),membership,allowedAtSource,signal:owner.signal});stages.owner.credit(()=>bank.dispose());checkAbort(owner.signal);requireValue(bank.descriptorSize===128,'ALIKED128 native descriptor layout changed.');return{...bank,owner,coverage,stages,release:()=>owner.dispose(),metadata:{...bank.metadata,native:stages.metrics,admission:stages.admission}};
 });
}
