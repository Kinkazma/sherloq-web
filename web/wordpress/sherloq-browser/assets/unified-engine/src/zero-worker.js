import "../../runtime-context.js?v=0.14.5";
import {serializeEngineError} from './errors.js';
import {zeroVoteArray} from './zero.js';
onmessage=async({data})=>{try{const votes=await zeroVoteArray(data.values,data.width,data.height);postMessage({votes},[votes.buffer]);}catch(e){postMessage({error:serializeEngineError(e,'INTERNAL_ERROR')});}};
