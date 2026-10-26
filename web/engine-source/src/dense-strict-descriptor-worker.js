import {installWorkerMessageProtocol} from './worker-message-protocol.js';
import {serializeEngineError} from './errors.js';
import {createDenseMath} from './dense-math.js';
import {createDenseRegions} from './dense-regions.js';
import {strictDenseDescriptors} from './dense-strict-descriptors.js';
let math,eligibility;
installWorkerMessageProtocol(self,async input=>{
 try{
  math??=await createDenseMath({print:()=>{}});
  eligibility??=await createDenseRegions();
  const result=strictDenseDescriptors(input,{math,eligibility});
  self.postMessage({result},[...new Set([result.first.buffer,result.second.buffer,result.mask.buffer])]);
 }catch(error){self.postMessage({error:serializeEngineError(error)});}
},{label:'strict-native-dense-descriptors',onFailure:error=>self.postMessage({error:serializeEngineError(error)})});
