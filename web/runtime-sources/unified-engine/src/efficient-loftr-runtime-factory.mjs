import "../../runtime-context.js?v=0.16.0";
import create,{heapBytes} from '../vendor/m3-ort/factory.mjs';
export {heapBytes};
export default async function(config){
 const pages=globalThis.__sherloqNeuralMemoryPages;
 if(!Number.isInteger(pages)||pages<256||pages>32768)throw Error('Unadmitted EfficientLoFTR heap');
 globalThis.__m3MaximumWasmPages=pages;return create(config);
}
