import {installWorkerMessageProtocol} from './worker-message-protocol.js';
import {serializeEngineError} from './errors.js';
import {createDenseRegions} from './dense-regions.js';
let pending;
installWorkerMessageProtocol(self,async p=>{try{const math=await(pending??=createDenseRegions()),values=p.values??new Uint8Array(p.coreWidth*p.coreHeight),result=math.allowed({width:p.width,height:p.height,data:p.rgb},{...p.settings,destination:{data:values,x:p.x,y:p.y,width:p.coreWidth,height:p.coreHeight}});self.postMessage({result:{values:result.mask,rgb:p.rgb,heapBytes:math.heapBytes}},[values.buffer,p.rgb.buffer]);}catch(e){self.postMessage({error:serializeEngineError(e,'NUMERIC_RANGE')});}},{label:'dense-texture-worker.js',onFailure:error=>self.postMessage({error:serializeEngineError(error)})});
