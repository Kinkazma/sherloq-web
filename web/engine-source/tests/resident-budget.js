import {createEngine} from '../src/index.js';
// Native modules are shared in one JS realm and retain their grown capacities.
// A later small-budget engine does not make those heaps disappear. Keep these
// tests' intended small working allowance above the actual resident floor.
export function residentBudget(workingBytes){const probe=createEngine();try{return Math.max(32*1024**2,probe.capabilities().memory.knownHeapCapacityBytes)+workingBytes;}finally{probe.dispose();}}
