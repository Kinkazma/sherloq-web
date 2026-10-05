import "../../runtime-context.js?v=0.14.5";
import {compileNumericTreeModel} from './numeric-tree-model.js';
export const compileQualityModel=(bytes,options)=>compileNumericTreeModel(bytes,{...options,kind:'jpeg-quality'});
