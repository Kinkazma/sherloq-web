import {WaveletStripPool} from './wavelet-strip-pool.js';
import {createNeuralWindowWorkerLink} from './neural-window-worker-link.js';
import {EngineError,requireValue} from './errors.js';
let post,current;
const budgets=new WeakMap();
export function installNeuralWindowControl(sender){requireValue(!post&&typeof sender==='function','One private Window controller may own this engine Worker.');post=sender;}
export function registerNeuralWindowEngineBudget(budget,profile,gpuAvailable=false){requireValue(typeof gpuAvailable==='boolean','Passive parent Window GPU capability must be boolean.');if(post)budgets.set(budget,{profile,link:null,gpuAvailable});}
export function neuralWindowControlMessage(message){if(!message?.neuralWindowControl)return false;requireValue(current,'No private Window bridge is awaiting a receipt.');return current.accept(message);}
export function openNeuralWindowConnection(budget,request){const registered=budgets.get(budget);if(!post||!registered)throw new EngineError('GPU_UNAVAILABLE','The targeted neural Window owner is not attached to this engine.');
 if(!registered.link){const owners=new WaveletStripPool(budget,{workerFactory:null});registered.link=createNeuralWindowWorkerLink({budget,post,onOwner:owner=>owners.ownCleanup(()=>typeof owner.close==='function'?owner.close():owner.dispose())});current=registered.link;}
 return registered.link.open(request);
}
export function neuralWindowBridgeAvailable(budget){return typeof post==='function'&&budgets.get(budget)?.gpuAvailable===true;}
