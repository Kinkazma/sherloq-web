import "../../runtime-context.js?v=0.30.0";
// This explicit admission list is independent of the extractor module graph.
// A public contract compares it with the qualified classical owner. Importing
// that owner here would create a registry/dispatcher ES-module cycle.
const qualified=Object.freeze(['SIFT','RootSIFT','AKAZE','BRISK','ORB','SIFT + G2NN + RANSAC','SSG','XFeat','XFeat + LighterGlue','ALIKED','ALIKED rotation','ALIKED + LightGlue','ALIKED rotation + LightGlue','SIFT + LightGlue','EfficientLoFTR','SIFT + G2NN + RANSAC + Panels + Text']);
import {checkAbort} from './errors.js';
/** Admission is deliberately variant- and shape-specific. Existing native
 * independent acquisitions keep their declared envelope context. Actual RGB
 * negatives require the qualified classical descriptor bank upstream. */
export const SOURCE_REGION_SPARSE_ADAPTER=Object.freeze({
 shapes:Object.freeze(['rectangle','membership']),
 handledInputs:Object.freeze(['task.regions','params.selection']),
 // The real registered EfficientLoFTR callback checks both literal native
 // crops before RGB/model work, including candidate admission before TopK.
 nativeRegionParameterRules:Object.freeze({}),
 previewOperations:Object.freeze(['tampering.copyMove.sparse']),
 previewParameterRules:Object.freeze({algorithm:Object.freeze({oneOf:Object.freeze(['SSG'])})}),
 shapeParameterRules:Object.freeze({membership:Object.freeze({algorithm:Object.freeze({default:'SIFT + G2NN + RANSAC',oneOf:qualified})})}),
 parameterConstraints:'Classical and learned native inputs run independently per selected window by default; explicit global mode uses one admitted union before native input and its existing matcher. SSG uses a common normalization grid and its separate support-aware native global pipeline. Learned and SIFT/LightGlue use their registered native window callbacks; EfficientLoFTR keeps two explicit native comparison roles within each analysis window; true holes use canonical disjoint admitted RGB contexts with native local grids and common two-role attention. Native locally-identical crops are reported per window without inference; already-identical Original roles remain invalid. Panels + Text with declared acquisitions or true exclusions uses the same native Tesseract acquisition-window callback as the received automatic route; ordinary whole-image Panels keeps its existing detector.',
 run:({task,runLegacy,signal})=>{checkAbort(signal);return runLegacy(task);}
});
