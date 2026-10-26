import "../../runtime-context.js?v=0.25.0";
import {checkAbort,requireValue} from './errors.js';
/** The four native clone providers keep their common source-coordinate matcher.
 * A verified Original scope is prepared and localized before this dispatch. */
export async function sourceRegionClones({task,runLegacy,signal}){checkAbort(signal);requireValue(task.operation==='analysis.clones'&&task.params?.scientificScope&&task.sourceRegionLocalization?.coordinates==='source-region-native','Clones providers require their localized signed scientific preparation.');return runLegacy(task);}
export const SOURCE_REGION_CLONES_ADAPTER={shapes:['rectangle','membership','native-regions'],handledInputs:['params.selection','params.scientificScope','task.scientificScope'],parameterConstraints:'Four native providers with verified candidate/context domains, global source-coordinate matching and explicit true negatives removed before scientific RGB reads.',run:sourceRegionClones};
