import "../../runtime-context.js?v=0.25.0";
import{SEGMENTATION_MODELS}from'../experiments/segmentation/models.js';
// Dispatch only. Geometry, backend, memory and scientific eligibility are
// checked by the native facade before RGB. In particular global union and
// within-window exclusions cannot fall back to a painted bounding rectangle.
export function segmentationIndependentSourceAdmitted(task){return task?.operation==='ai.clones.segmentation'&&typeof task.params?.variant==='string'&&Object.hasOwn(SEGMENTATION_MODELS,task.params.variant);}
export function segmentationIndependentProductAvailable(){return true;}

// Public admission metadata for the dedicated Original-window route above.
// Only geometry inputs consumed by clone-analysis-windows/neural-strict-source-
// context are handled here. Native params, backend/mode, shape and memory
// validation still run in their existing facades before RGB/model execution.
export function segmentationIndependentSourceCapability(){return{
 shapes:['rectangle','native-regions','membership'],
 handledInputs:['task.regions','task.scientificScope','params.selection','params.regions','params.scientificScope','params.exclusions','params.excluded'],
 parameterRules:{variant:{oneOf:Object.keys(SEGMENTATION_MODELS)}}
};}
