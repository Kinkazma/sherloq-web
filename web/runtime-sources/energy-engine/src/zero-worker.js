import {zeroVoteArray} from './zero.js';
onmessage=async({data})=>{try{const votes=await zeroVoteArray(data.values,data.width,data.height);postMessage({votes},[votes.buffer]);}catch(e){postMessage({error:e.code??'INTERNAL_ERROR'});}};
