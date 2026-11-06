// Every observation belongs to a requested, completed native/GPU filter. A
// native fallback supplies its own timing from the unchanged C++ arithmetic.
export function createStereoBlurPolicy(){
 const states=new Map();let gpuFloor=Infinity;
 const key=(size,kind)=>kind?'matrix':size<=5?'image-small':'image-large';
 const state=(size,kind)=>{const name=key(size,kind);let value=states.get(name);if(!value){value={cpuUnits:0,cpuMs:0,cpuSamples:0,gpuUnits:0,gpuMs:0,gpuSamples:0,gpuFloor:Infinity,refused:false};states.set(name,value);}return value;};
 const units=(width,height,size,kind)=>width*height*(kind?5:1)*(kind?size*2-1:size);
 return{
  observeCpu(width,height,size,kind,milliseconds){if(!(milliseconds>0))return;const s=state(size,kind);s.cpuUnits+=units(width,height,size,kind);s.cpuMs+=milliseconds;s.cpuSamples++;},
  observeGpu(width,height,size,kind,milliseconds){if(!(milliseconds>0))return;const s=state(size,kind);s.gpuUnits+=units(width,height,size,kind);s.gpuMs+=milliseconds;s.gpuSamples++;s.gpuFloor=Math.min(s.gpuFloor,milliseconds);gpuFloor=Math.min(gpuFloor,milliseconds);},
  refuse(size,kind){state(size,kind).refused=true;},
  choose(width,height,size,kind){return{gpu:false,reason:'shared-before-owner-decision-required'};},
  snapshot(){return{gpuFloor:Number.isFinite(gpuFloor)?gpuFloor:null,states:Object.fromEntries([...states].map(([key,value])=>[key,{...value,gpuFloor:Number.isFinite(value.gpuFloor)?value.gpuFloor:null}]))};}
 };
}
