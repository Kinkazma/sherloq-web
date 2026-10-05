import "../../runtime-context.js?v=0.14.5";
import {installWorkerMessageProtocol} from './worker-message-protocol.js';
import {serializeEngineError} from './errors.js';
import {createDenseMath,denseGray} from './dense-math.js';
let pending;
installWorkerMessageProtocol(self,async({rgb,width,height,patch,reflection,x,y,coreWidth,coreHeight})=>{
 try{
  const math=await(pending??=createDenseMath({print:()=>{}})),gray=denseGray(rgb),features=math.features(gray,width,height,{method:0,patch,reflection});
  const first=new Float32Array(coreWidth*coreHeight*12),second=reflection?new Float32Array(first.length):first;
  for(let row=0;row<coreHeight;row++){
   const start=((y+row)*width+x)*12,end=start+coreWidth*12;
   first.set(features.first.subarray(start,end),row*coreWidth*12);
   if(reflection)second.set(features.second.subarray(start,end),row*coreWidth*12);
  }
  self.postMessage({result:{first,second,heapBytes:math.heapBytes}},reflection?[first.buffer,second.buffer]:[first.buffer]);
 }catch(e){self.postMessage({error:serializeEngineError(e,'NUMERIC_RANGE')});}
},{label:'dense-zernike-tile-worker.js',onFailure:error=>self.postMessage({error:serializeEngineError(error)})});
