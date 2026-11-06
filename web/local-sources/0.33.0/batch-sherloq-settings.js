import {isDetectorAlias,detectorTask} from './ai-detector-tools.js?v=0.33.0';
import {equalizationState} from './equalization-menu.js?v=0.33.0';
const invalid = (parameter,value) => Object.assign(new Error('Invalid SHERLOQ batch '+parameter+': '+String(value)),{code:'INVALID_INPUT',details:{parameter,value}});

export const isBatchSherloq = recipe => recipe?.operation==='inspection.sherloq7c';

// Batch preferences predate the Fast/Precision and output-size controls. Keep
// their revelation settings, while migrating the hidden legacy precision.
export function normalizeBatchSherloqParams(params={}){
 const computationMode=params.computationMode??'fast',maxSide=params.maxSide==null||Number.isNaN(params.maxSide)?512:params.maxSide;
 if(!['fast','precision'].includes(computationMode))throw invalid('computationMode',computationMode);
 if(![256,512,1024,2048,'native'].includes(maxSide))throw invalid('maxSide',maxSide);
 return {...params,computationMode,maxSide,revelation:params.revelation??100,micro:params.micro??100,precision:'1e-2'};
}

export function normalizeBatchSherloqRecipe(recipe){
 if(isDetectorAlias(recipe?.id))recipe={...recipe,...detectorTask(recipe.id,recipe.params)};
 const normalized=isBatchSherloq(recipe)?{...recipe,params:normalizeBatchSherloqParams(recipe.params)}:recipe;
 return normalized?.params?.equalization?.method==='sherloq7c'?{...normalized,params:{...normalized.params,equalization:equalizationState(normalized.params.equalization)}}:normalized;
}

// The type belongs to each choice, not to the field's default. In particular,
// SHERLOQ output sizes combine numbers and the string "native".
export function batchChoiceValue(definition,raw){
 if(raw===''&&definition.nullable)return null;
 const choice=definition.choices?.find(choice=>String(choice.value)===String(raw));
 if(!choice)throw Object.assign(new Error('Invalid batch choice: '+String(raw)),{code:'INVALID_INPUT',details:{parameter:definition.key,value:raw}});
 return choice.value;
}
