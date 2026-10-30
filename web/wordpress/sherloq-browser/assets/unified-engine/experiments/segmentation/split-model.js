import {requireValue} from '../../src/errors.js';

// The manifest itself is hash-verified before this function is called. Validate
// the supported shape/lifetime contract before admitting its child sessions.
export function validateSplitModel(manifest, model) {
  requireValue(manifest?.schema===1 && manifest.id===model.id && manifest.sourceSha256===model.cpuSha256 && manifest.checkpointSha256===model.checkpointSha256 && manifest.side===256 && manifest.kind===model.kind, 'Split model identity');
  requireValue(Array.isArray(manifest.stages)&&manifest.stages.length===2 && manifest.assetBytes===model.assetBytes && manifest.stages.reduce((n,s)=>n+s.bytes,0)===model.assetBytes, 'Split asset sizes');
  const names=['/network/visual_feature_extractor/Concat_4_output_0','/network/visual_feature_extractor/layer1/layer1.0/layer1.0.0/layer1.0.0.0/Constant_output_0'];
  requireValue(JSON.stringify(manifest.boundary)===JSON.stringify([{name:names[0],dtype:'FLOAT',shape:[1,640,40,40]},{name:names[1],dtype:'INT64',shape:[]}]), 'Complete feature boundary required');
  for(let i=0;i<2;i++){
    const stage=manifest.stages[i];
    requireValue(stage.file===(i?'gpu-split-head.onnx':'gpu-split-encoder.onnx')&&Number.isSafeInteger(stage.bytes)&&stage.bytes>0&&/^[a-f0-9]{64}$/.test(stage.sha256)&&stage.backend===model.stageBackends[i], 'Pinned split stage');
    requireValue(JSON.stringify(stage.inputs)===JSON.stringify(i?names:['rgb'])&&JSON.stringify(stage.outputs)===JSON.stringify(i?['logits','probability']:names),'Split tensor names');
  }
  return manifest;
}

export async function readPinnedSplitAsset(url, spec) {
  const response=await fetch(url);
  if(!response.ok||!response.body)throw Error('Model response unavailable');
  const bytes=new Uint8Array(spec.bytes),reader=response.body.getReader();let at=0;
  try{while(true){const{value,done}=await reader.read();if(done)break;if(at+value.byteLength>bytes.length)throw Error('Model exceeds pinned size');bytes.set(value,at);at+=value.byteLength;}}
  finally{await reader.cancel();reader.releaseLock();}
  const sha=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),v=>v.toString(16).padStart(2,'0')).join('');
  if(at!==spec.bytes||sha!==spec.sha256)throw Error('Model identity mismatch');
  return bytes;
}
