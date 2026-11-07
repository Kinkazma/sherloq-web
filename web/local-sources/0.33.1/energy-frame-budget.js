import {EngineError} from './unified-engine/src/errors.js';
/** Only worker-owned RGB buffers live in the consumer reservation. Original
 * pixels/planes, native windows and band scratch belong to the engine ledger;
 * main-thread viewport canvases/transport are admitted by uiReserveBytes. */
export function energyFrameBudget({width,height,presentation={},previousBytes=0,preview=null,snapshotCopies=0}={}){
 const panels=presentation.view==='scores'&&presentation.field==='both'?2:1,logicalWidth=width*panels;
 if(![width,height].every(v=>Number.isSafeInteger(v)&&v>0)||!Number.isSafeInteger(logicalWidth)||!Number.isSafeInteger(previousBytes)||previousBytes<0||!Number.isSafeInteger(snapshotCopies)||snapshotCopies<0)throw new EngineError('INVALID_INPUT','Invalid Energy RGB ownership plan.');
 const scale=preview?Math.min(1,preview.maxWidth/logicalWidth,preview.maxHeight/height):1,frameWidth=Math.max(1,Math.floor(width*scale))*panels,frameHeight=Math.max(1,Math.floor(height*scale)),frameBytes=frameWidth*frameHeight*3,requiredBytes=previousBytes+frameBytes*(1+snapshotCopies);
 if(!Number.isSafeInteger(requiredBytes))throw new EngineError('RESULT_MEMORY_BUDGET','Energy RGB ownership exceeds exact addressable bytes.');
 return{width:frameWidth,height:frameHeight,frameBytes,previousBytes,snapshotBytes:frameBytes*snapshotCopies,requiredBytes,scientificMaps:'engine-owned-native-planes',originalPixels:'borrowed-engine-windows',scratch:'bounded-engine-admission',viewport:'separate-ui-reservation'};
}
export function assertEnergyFrameBudget(plan,budgetBytes){if(!Number.isSafeInteger(budgetBytes)||budgetBytes<0||plan.requiredBytes>budgetBytes)throw new EngineError('RESULT_MEMORY_BUDGET','The retained and requested native RGB views exceed their available presentation budget.',{details:{energyRgbOwnership:plan,consumerBudgetBytes:budgetBytes}});return plan;}
