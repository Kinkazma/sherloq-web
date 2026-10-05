import {compileNumericTreeModel} from './numeric-tree-model.js';
export const compileQualityModel=(bytes,options)=>compileNumericTreeModel(bytes,{...options,kind:'jpeg-quality'});
