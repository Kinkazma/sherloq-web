import {cvNoisesnifferStatistics} from './opencv.js';
onmessage=async({data})=>{try{const result=await cvNoisesnifferStatistics(data.image,data.block,{part:'dct',fast:true});postMessage({variance:result.variance},[result.variance.buffer]);}catch(error){postMessage({error:error.code??'INTERNAL_ERROR'});}};
