import {d2prlInputSide} from './input-side.js';
import {createWasmTensorArena} from '../../src/wasm-tensor-arena.js';
import {validateD2prlFloat32} from './parameter-ownership.js';
// Bounded helpers for the private UNet composition study. No runtime operation.
import {requireValue, checkAbort, controlCheckpoint, EngineError} from '../../src/errors.js';
const PAGE = 16 * 1024 ** 2, MAX = 512 * 1024 ** 2;
const elements = shape => shape.reduce((a, b) => a * b, 1);
export async function createNeuralMath(factory, {budget,arena,inputSide=448,arithmetic='cpu',operation:recover=(_label,work)=>work()} = {}) {
  requireValue(budget && typeof budget.reserve === 'function', 'Shared budget required');
  requireValue(['cpu','mps'].includes(arithmetic),'Explicit neural arithmetic required');
  const SIDE=d2prlInputSide(inputSide),heapMaximum=SIDE===448?MAX:2*1024**3;
  const ownsArena=!arena;
  const resident = [],channelOutputs=new Set();let channelDisposal;
  const retireChannelOutputs=async()=>{let failed=false,primary;for(const owner of [...channelOutputs])try{const value=await owner.release();if(value===0||value===false)throw value;channelOutputs.delete(owner);}catch(error){if(!failed){failed=true;primary=error;}}if(failed)throw primary;};
  let backing;let module, accounted = PAGE, busy = false, disposed = false;
  try { resident.push(budget.reserve(PAGE));arena??=createWasmTensorArena({budget});module = await factory(); requireValue(module.HEAPU8.length <= accounted, 'Initial helper heap'); }
  catch (error) { resident.pop()?.();if(ownsArena)arena?.dispose(); throw error; }
  let trackedHeapBytes=0;const trackHeap=()=>{const bytes=module.HEAPU8.byteLength;if(bytes===trackedHeapBytes)return;backing?.();backing=budget.registerBacking?.('wasm',bytes,{owner:'d2prl',label:'neural-math-heap'});trackedHeapBytes=bytes;};trackHeap();
  return {
    async run(operation, tensors, attrs = {}, {signal,resourceOperation} = {}) {
      if (busy) throw new EngineError('BUSY', 'Neural math busy');
      requireValue(!disposed && Array.isArray(tensors) && tensors.length > 0, 'Neural math unavailable');
      for (const t of tensors) requireValue(t.data instanceof Float32Array && t.shape.every(n => Number.isInteger(n) && n > 0) && t.data.length === elements(t.shape), 'Float32 tensor required');
      // Finite Add/Mul commute, including signed zero. Only swap operands when
      // the smaller first operand must broadcast over the second tensor.
      if (['Add', 'Mul'].includes(operation) && tensors.length === 2 && tensors[0].data.length < tensors[1].data.length) tensors = [tensors[1], tensors[0]];
      const a = tensors[0], [batch, channels, height, width] = a.shape, plane = height * width;
      requireValue(operation === 'SumAll' || (a.shape.length === 4 && batch === 1 && channels <= 4096 && height <= SIDE && width <= SIDE), 'Fixed448 NCHW tensor required');
      let shape = [...a.shape], scratch = 0;
      if (operation === 'SumAll') {
        requireValue(tensors.length === 1 && a.data.length <= 4 * 1024 ** 2 && attrs.referenceThreads === 8, 'Pinned sum reference domain'); shape = [1, 1, 1, 1];
      } else if (operation === 'BatchNormalization') {
        requireValue(tensors.length === 5 && channels <= 2048 && tensors.slice(1).every(t => t.data.length === channels) && attrs.training_mode === 0 && attrs.epsilon > 0, 'Inference BatchNorm parameters');
        requireValue(arithmetic!=='mps'||typeof module._d2prl_mps_batchnorm==='function','MPS neural BatchNorm requires its separately pinned helper');
        scratch = channels * 8;
      } else if (operation === 'GlobalAveragePool') {
        requireValue(channels >= 2 && channels <= 2048 && plane >= 4 && plane <= (SIDE/2)**2, 'Mean reference domain');
        shape = [1, channels, 1, 1]; scratch = channels * 4;
      } else if (operation === 'Sigmoid') requireValue(a.data.length % 8 === 0, 'Vector sigmoid domain');
      else if (operation === 'Nearest2') {
        requireValue(height <= SIDE/2 && width <= SIDE/2, 'Nearest resize domain'); shape = [1, channels, height * 2, width * 2];
      } else if (operation === 'MaxPool') {
        const {kernel_shape: k, strides: s, pads: p, ceil_mode: ceil, dilations: d} = attrs;
        requireValue(k?.length === 2 && k[0] === k[1] && k[0] === 3 && s?.length === 2 && s.every(x => x === 2) && p?.length === 4 && p.every(x => x === 0) && ceil === 1 && d.every(x => x === 1), 'Fixed UNet maxpool domain');
        const dim = n => Math.ceil((n - 3) / 2) + 1;
        shape = [1, channels, dim(height), dim(width)];
      } else if (operation === 'PointConv4Probe' || operation === 'PointConvProbe') {
        requireValue(plane === 1 && tensors.length === 3 && channels % 4 === 0 && tensors[1].shape.length === 4 && tensors[1].shape[1] === channels && tensors[1].shape[2] === 1 && tensors[1].shape[3] === 1 && tensors[2].data.length === tensors[1].shape[0], 'Experimental point convolution domain');
        shape = [1, tensors[1].shape[0], 1, 1];
        if (operation === 'PointConvProbe') requireValue(channels >= 16 && channels % 16 === 0 && [1, 2].includes(attrs.mode), 'Explicit point reduction candidate');
      } else {
        requireValue(['Relu', 'Add', 'Mul', 'Max'].includes(operation), 'Unknown neural operation');
        if (operation !== 'Relu') {
          const b = tensors[1];
          requireValue(tensors.length === 2 && b?.shape.length === 4 && b.shape[0] === 1 && [1, channels].includes(b.shape[1]) && ((b.shape[2] === height && b.shape[3] === width) || (b.shape[2] === 1 && b.shape[3] === 1)), 'Supported NCHW broadcast');
        }
      }
      const borrowed = tensors.reduce((n, t) => n + t.data.byteLength, 0), outputBytes = elements(shape) * 4;
      // Existing kernels already run one complete channel at a time. Only
      // their transport is windowed; global offsets and SIMD grouping remain
      // the original values. Small/unsupported layouts keep the original path.
      const channelWindow=Math.max(65536,Math.min(64*1024**2,Math.floor(budget.limit/32)));
      const channelTransport=SIDE>=1344&&budget.limit<=2*1024**3&&arithmetic==='mps'&&borrowed+outputBytes>channelWindow&&(['Nearest2','MaxPool','Relu','Add','Mul','Max','BatchNormalization'].includes(operation)||operation==='Sigmoid'&&plane%8===0);
      if(channelTransport){
        const outPlane=shape[2]*shape[3],inputLengths=tensors.map((t,i)=>i===0?plane:operation==='BatchNormalization'?1:t.shape[2]*t.shape[3]),windowBorrowed=inputLengths.reduce((n,v)=>n+v*4,0);
        const target=Math.max(accounted,Math.ceil((windowBorrowed+outPlane*4+PAGE)/PAGE)*PAGE);requireValue(target<=heapMaximum,'Neural channel helper heap limit');checkAbort(signal);busy=true;
        let active,result,complete=false,failed=false,primary,stamp=performance.now();const pointers=[];
        const checkpoint=async()=>{if(performance.now()-stamp>=8){await controlCheckpoint(signal);stamp=performance.now();}};
        try{
          resourceOperation?.setState('waiting-child');
          await retireChannelOutputs();
          resourceOperation?.setState('compute');
          active=budget.reserve(windowBorrowed+target-accounted);if(target>accounted){resident.push(active.split(target-accounted));accounted=target;}
          const allocate=bytes=>{const ptr=module._malloc(bytes);trackHeap();if(ptr)pointers.push(ptr);if(!ptr)throw new EngineError('MEMORY_ALLOCATION','Native D2PRL channel allocation refused');requireValue(module.HEAPU8.length<=accounted,'Neural channel helper allocation');return ptr;};
          for(const{data}of tensors)await validateD2prlFloat32(data,{signal,message:'Nonfinite neural input',checkpoint});
          const inputs=inputLengths.map(n=>allocate(n*4)),out=allocate(outPlane*4);
          resourceOperation?.setState('waiting-child');
          result=await recover('neural:channel-copy-admission',({resourceOperation:copyOperation}={})=>{copyOperation?.setState('compute');const owner=arena.allocate(Float32Array,elements(shape),{signal,zero:false,label:'neural:'+operation});channelOutputs.add(owner);return owner;},{bytes:outputBytes});
          resourceOperation?.setState('compute');
          const ok=value=>requireValue(value===1,operation+' rejected');
          for(let c=0;c<channels;c++){
            checkAbort(signal);for(let i=0;i<tensors.length;i++){const t=tensors[i],start=i===0?c*plane:operation==='BatchNormalization'?c:(t.shape[1]===1?0:c)*inputLengths[i];module.HEAPF32.set(t.data.subarray(start,start+inputLengths[i]),inputs[i]/4);}
            if(operation==='BatchNormalization')ok(module._d2prl_mps_batchnorm(inputs[0],inputs[3],inputs[4],inputs[1],inputs[2],1,plane,attrs.epsilon,0,out));
            else if(operation==='Nearest2')ok(module._d2prl_nearest2(inputs[0],1,height,width,out));
            else if(operation==='MaxPool')ok(module._d2prl_maxpool(inputs[0],1,height,width,3,2,0,1,out));
            else if(operation==='Sigmoid')for(let i=0;i<plane;i+=65536){ok(module._d2prl_sigmoid_values(inputs[0]+i*4,Math.min(65536,plane-i),out+i*4));await checkpoint();}
            else{const opcode={Relu:0,Add:1,Mul:2,Max:3}[operation],b=tensors[1],bp=b?b.shape[2]*b.shape[3]:1;ok(module._d2prl_pointwise(inputs[0],b?inputs[1]:0,1,plane,1,bp,opcode,c*plane,Math.floor(a.data.length/8)*8,out));}
            checkAbort(signal);result.data.set(module.HEAPF32.subarray(out/4,out/4+outPlane),c*outPlane);await checkpoint();
          }
          checkAbort(signal);resourceOperation?.commit();resourceOperation?.setState('waiting-child');result.shape=shape;complete=true;
        }catch(error){failed=true;primary=error;throw error;}finally{let cleanupFailed=false,cleanupPrimary;const attempt=async work=>{try{const value=await work();if(value===0||value===false)throw value;}catch(error){if(!cleanupFailed){cleanupFailed=true;cleanupPrimary=error;}}};for(const ptr of pointers)await attempt(()=>module._free(ptr));await attempt(()=>active?.());if(!complete||cleanupFailed)await attempt(retireChannelOutputs);busy=false;if(cleanupFailed){if(!failed)throw cleanupPrimary;if(primary&&typeof primary==='object'&&Object.isExtensible(primary))try{primary.details={...primary.details,channelTransportCleanup:cleanupPrimary};}catch{}}}
        // Cleanup above awaits real retirement. Revalidate once more before
        // handing the independent reader loan to the graph; no await follows.
        try{checkAbort(signal);}catch(error){try{await retireChannelOutputs();}catch(cleanup){if(error&&typeof error==='object'&&Object.isExtensible(error))try{error.details={...error.details,channelTransportCleanup:cleanup};}catch{}}throw error;}
        channelOutputs.delete(result);return result;
      }
      const target = Math.max(accounted, Math.ceil((borrowed + scratch + outputBytes + PAGE) / PAGE) * PAGE);
      requireValue(target <= heapMaximum, 'Neural helper heap limit'); checkAbort(signal); busy = true;
      let active, resultRelease, complete = false, stamp = performance.now();
      const pointers = [], checkpoint = async () => { if (performance.now() - stamp >= 8) { await controlCheckpoint(signal); stamp = performance.now(); } };
      try {
        resourceOperation?.setState('compute');
        active = budget.reserve(borrowed+target-accounted);
        if (target > accounted) { resident.push(active.split(target - accounted)); accounted = target; }
        const allocate = bytes => {
          const ptr = module._malloc(bytes);trackHeap();
          if (ptr) pointers.push(ptr);
          if(!ptr)throw new EngineError('MEMORY_ALLOCATION','Native D2PRL allocation refused'); requireValue(module.HEAPU8.length <= accounted, 'Neural helper allocation'); return ptr;
        };
        for(const {data} of tensors)await validateD2prlFloat32(data,{signal,message:'Nonfinite neural input',checkpoint});
        const inputs = tensors.map(({data}) => { const ptr = allocate(data.byteLength); module.HEAPF32.set(data, ptr / 4); return ptr; });
        const out = allocate(outputBytes), temp = scratch ? allocate(scratch) : 0;
        checkAbort(signal);
        const ok = value => requireValue(value === 1, operation + ' rejected');
        if (operation === 'SumAll') {
          ok(module._d2prl_sum_all(inputs[0], a.data.length, attrs.referenceThreads, out)); await checkpoint();
        } else if (operation === 'BatchNormalization') {
          if(arithmetic==='mps'){
            for(let c=0;c<channels;c++){ok(module._d2prl_mps_batchnorm(inputs[0]+c*plane*4,inputs[3]+c*4,inputs[4]+c*4,inputs[1]+c*4,inputs[2]+c*4,1,plane,attrs.epsilon,0,out+c*plane*4));await checkpoint();}
          }else{
          ok(module._d2prl_batchnorm_parameters(inputs[3], inputs[4], inputs[1], inputs[2], channels, attrs.epsilon, temp, temp + channels * 4));
          for (let c = 0; c < channels; c++) { ok(module._d2prl_affine(inputs[0] + c * plane * 4, temp + c * 4, temp + (channels + c) * 4, 1, plane, 0, out + c * plane * 4)); await checkpoint(); }
          }
        } else if (operation === 'GlobalAveragePool') {
          // The reduction's channel count does not alter its arithmetic. Pairs
          // permit cooperative cancellation while respecting its domain >=2.
          requireValue(channels % 2 === 0, 'Even UNet mean channels');
          for (let c = 0; c < channels; c += 2) { ok(module._d2prl_mean_planes(inputs[0] + c * plane * 4, 2, plane, 0, temp + c * 4, out + c * 4)); await checkpoint(); }
        } else if (operation === 'PointConv4Probe' || operation === 'PointConvProbe') {
          for (let c = 0; c < shape[1]; c++) {
            const args = [inputs[0], inputs[1] + c * channels * 4, inputs[2] + c * 4, channels, 1];
            ok(operation === 'PointConv4Probe' ? module._d2prl_pointconv4_probe(...args, out + c * 4) : module._d2prl_pointconv_probe(...args, attrs.mode, c, out + c * 4)); await checkpoint();
          }
        } else if (operation === 'Nearest2' || operation === 'MaxPool') {
          for (let c = 0; c < channels; c++) {
            const source = inputs[0] + c * plane * 4, dest = out + c * shape[2] * shape[3] * 4;
            ok(operation === 'Nearest2' ? module._d2prl_nearest2(source, 1, height, width, dest) : module._d2prl_maxpool(source, 1, height, width, 3, 2, 0, 1, dest)); await checkpoint();
          }
        } else if (operation === 'Sigmoid') {
          for (let i = 0; i < a.data.length; i += 65536) { ok(module._d2prl_sigmoid_values(inputs[0] + i * 4, Math.min(65536, a.data.length - i), out + i * 4)); await checkpoint(); }
        } else {
          const opcode = {Relu: 0, Add: 1, Mul: 2, Max: 3}[operation], b = tensors[1], bp = b ? b.shape[2] * b.shape[3] : 1;
          for (let c = 0; c < channels; c++) {
            const bptr = b ? inputs[1] + (b.shape[1] === 1 ? 0 : c * bp * 4) : 0;
            ok(module._d2prl_pointwise(inputs[0] + c * plane * 4, bptr, 1, plane, 1, bp, opcode, c * plane, Math.floor(a.data.length / 8) * 8, out + c * plane * 4)); await checkpoint();
          }
        }
        checkAbort(signal);resourceOperation?.commit();resourceOperation?.setState('waiting-child'); const result=await recover('neural:copy',({resourceOperation:copyOperation}={})=>{copyOperation?.setState('compute');const value=arena.allocate(Float32Array,elements(shape),{signal,zero:false,label:'neural:'+operation});try{value.data.set(module.HEAPF32.subarray(out/4,out/4+elements(shape)));return value;}catch(error){value.release();throw error;}},{bytes:outputBytes});
        resultRelease=result.release;result.shape=shape;complete=true;return result;
      } finally { resourceOperation?.setState('waiting-child');for (const ptr of pointers) module._free(ptr); active?.(); if (!complete) resultRelease?.(); busy = false; }
    },
    dispose() {requireValue(!busy,'Neural math busy');if(!module)return;disposed=true;const finish=()=>{if(ownsArena)arena.dispose();const heapBytes=module.HEAPU8.byteLength;module=null;backing?.();backing=null;budget.notifyBackingRelease?.('wasm',heapBytes);for(const free of resident)free();};if(!channelOutputs.size)return finish();if(channelDisposal)return channelDisposal;channelDisposal=(async()=>{await retireChannelOutputs();finish();})();void channelDisposal.catch(()=>{channelDisposal=null;});return channelDisposal;}
  };
}
