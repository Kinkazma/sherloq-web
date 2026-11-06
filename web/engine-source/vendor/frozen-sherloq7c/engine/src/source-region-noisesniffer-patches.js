import {requireValue,checkAbort,createCooperator} from './errors.js';
import {numpySum} from './numpy-sum.js';

// Chosen IDs retain the global native bin order. This reader gathers only each
// certified selected block; a wide performance band cannot re-admit RGB holes.
export async function sourceRegionNoisesnifferStd(image,chosen,cols,c,w,{signal,target,block:inputBlock,squares:inputSquares}={}){
 requireValue(typeof image.readScientificPatch==='function'&&chosen instanceof Uint32Array&&Number.isInteger(cols)&&cols>0&&Number.isInteger(c)&&c>=0&&c<3&&[3,5,7,8].includes(w),'A native certified Noisesniffer patch reader is required.');
 // Selection already owns these arrays under its native workspace admission.
 // Reuse them rather than retaining a second candidate-sized deviation array.
 const block=inputBlock??new Float64Array(w*w),squares=inputSquares??new Float64Array(w*w),std=target??new Float64Array(chosen.length),cooperate=createCooperator(signal);let flat=0;
 requireValue(block instanceof Float64Array&&squares instanceof Float64Array&&std instanceof Float64Array&&block.length===w*w&&squares.length===w*w&&std.length===chosen.length,'Native patch workspaces do not match the selected blocks.');
 for(let i=0;i<chosen.length;i++){
  await cooperate();checkAbort(signal);const x=chosen[i]%cols,y=Math.floor(chosen[i]/cols),lease=await image.readScientificPatch({x,y,width:w,height:w},{signal});
  try{checkAbort(signal);const pixels=lease.pixels;requireValue(pixels?.format==='rgb8'&&pixels.width===w&&pixels.height===w&&pixels.data.length===w*w*3,'The native Noisesniffer patch reader returned another grid.');for(let at=0;at<block.length;at++)block[at]=pixels.data[at*3+c];const mean=numpySum(block)/block.length;for(let at=0;at<block.length;at++){const d=block[at]-mean;squares[at]=d*d;}std[i]=Math.sqrt(numpySum(squares)/squares.length);if(std[i]===0)flat++;}finally{lease.release();}
 }
 checkAbort(signal);return{std,flat};
}
