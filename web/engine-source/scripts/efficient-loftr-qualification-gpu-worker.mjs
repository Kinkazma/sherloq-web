// Numerical qualification only: count actual WebGPU queue submissions. No
// change to commands, tensors, shaders, operators, scheduling or math.
const pending=[];self.onmessage=event=>pending.push(event);
let queueSubmissions=0;const shaderPrograms=[];
if(typeof GPUDevice!=='undefined'){
 const create=GPUDevice.prototype.createShaderModule;
 GPUDevice.prototype.createShaderModule=function(descriptor){
  const code=descriptor.code,label=descriptor.label??'';
  shaderPrograms.push({label,usesF16:/\bf16\b/.test(code),float32TypeAliases:(code.match(/(?:alias|var).*f32/g)??[]).slice(0,6),...(shaderPrograms.length<16&&/matmul/i.test(label)?{code}:{})});
  return Reflect.apply(create,this,[descriptor]);
 };
}

if(typeof GPUQueue!=='undefined'){
 const submit=GPUQueue.prototype.submit;
 GPUQueue.prototype.submit=function(...args){queueSubmissions++;return Reflect.apply(submit,this,args);};
}
const send=self.postMessage.bind(self);
self.postMessage=(message,transfer)=>send(message?.result?{...message,qualificationGpu:{queueSubmissions,shaderPrograms}}:message,transfer);
await import('/engine-source/src/neural-graph-worker.js');

const handle=self.onmessage;for(const event of pending)handle(event);pending.length=0;
