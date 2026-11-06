// Controlled Mini analyzer double for scope/ownership tests; no neural parity claim.
import {truforFixture} from './trufor-strict-fixture.mjs';
import {createTruforMiniStrictAnalyzer} from '../../src/trufor-mini-strict-analyzer.js';
export async function truforMiniFixture(options={}){
 const f=await truforFixture(options),analyze=f.native.analyze.bind(f.native);
 f.native.analyze=async(...args)=>{const result=await analyze(...args);delete result.data.confidence;result.data.metadata={...result.data.metadata,method:'trufor-mini',scoreKind:'mean_top_1_percent_localization',scoreInterpretation:'controlled empirical map summary; no official classifier'};return result;};
 const api=createTruforMiniStrictAnalyzer({budget:f.budget,analyzer:f.native});
 return {...f,api,run(options={}){return api.analyze(f.image,{}, {sourceRegionDomain:f.domain.descriptor,...options});},async close(){await api.dispose();},get reads(){return f.reads;}};
}
