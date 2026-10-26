import "../../runtime-context.js?v=0.25.0";
import {checkAbort,requireValue} from './errors.js';
/** The existing Core owns the five native providers and their shared source.
 * SourceRegionRuntime localizes the signed complete task before this dispatch;
 * the operation is delegated to Core rather than replaced by a raster mask. */
export async function sourceRegionComplete({task,runLegacy,signal}){
 checkAbort(signal);requireValue(task.operation==='analysis.complete'&&task.params?.scientificScope&&task.sourceRegionLocalization?.coordinates==='source-region-native','Complete native providers require their localized scientific preparation.');
 return runLegacy(task);
}
export const SOURCE_REGION_COMPLETE_ADAPTER={shapes:['rectangle','membership','native-regions'],handledInputs:['params.selection','params.scientificScope','task.scientificScope'],parameterConstraints:'Five native branches: global clone matching over verified strict contexts, and independent native ELA acquisition references; true negatives never enter scientific RGB reads.',run:sourceRegionComplete};
