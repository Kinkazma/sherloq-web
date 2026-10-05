import "../../runtime-context.js?v=0.14.5";
import {compileNumericTreeModel} from './numeric-tree-model.js';
export {medianSigmoid} from './numeric-tree-model.js';
export const compileMedianModel=(bytes,options)=>compileNumericTreeModel(bytes,{...options,kind:'median'});
