import "../../runtime-context.js?v=0.14.5";
import {EngineError, requireValue, checkAbort} from './errors.js';
const f = Math.fround;
export const DENSE_HEAP_LIMIT = 2 ** 31;

// NumPy contiguous float32 pairwise reduction (including the eight lanes).
function sumFloat32(values, start, count, square = false) {
  const get = i => square ? f(values[i] * values[i]) : values[i];
  if (count < 8) { let total = -0; for (let i = 0; i < count; i++) total = f(total + get(start + i)); return total; }
  if (count > 128) { const half = Math.floor(Math.floor(count / 2) / 8) * 8; return f(sumFloat32(values, start, half, square) + sumFloat32(values, start + half, count - half, square)); }
  const lanes = Array.from({length: 8}, (_, i) => get(start + i));
  let i = 8;
  for (; i <= count - 8; i += 8) for (let j = 0; j < 8; j++) lanes[j] = f(lanes[j] + get(start + i + j));
  let total = f(f(f(lanes[0] + lanes[1]) + f(lanes[2] + lanes[3])) + f(f(lanes[4] + lanes[5]) + f(lanes[6] + lanes[7])));
  for (; i < count; i++) total = f(total + get(start + i));
  return total;
}
export function normalizeDense(values, dimensions) {
  requireValue(values instanceof Float32Array && [12, 128].includes(dimensions) && values.length % dimensions === 0, 'Invalid dense descriptor array.');
  for (let start = 0; start < values.length; start += dimensions) {
    const norm = Math.max(f(Math.sqrt(sumFloat32(values, start, dimensions, true))), f(1e-12));
    for (let i = start; i < start + dimensions; i++) values[i] = f(values[i] / norm);
  }
  return values;
}
export function denseGray(rgb) {
  requireValue(rgb instanceof Uint8Array && rgb.length % 3 === 0, 'RGB8 source required.');
  const gray = new Float32Array(rgb.length / 3), scale = f(1 / f(Math.sqrt(3)));
  for (let i = 0; i < gray.length; i++) gray[i] = f((rgb[3*i] + rgb[3*i+1] + rgb[3*i+2]) * scale);
  return gray;
}

// Native quarter-turn canonicalization and doubled-angle diversity gate.
// Each block uses scratch for one vector, so in-place rotation is safe.
export function canonicalDenseSift(values) {
  requireValue(values instanceof Float32Array && values.length % 128 === 0, 'Dense SIFT requires 128 components.');
  const diversity = new Uint8Array(values.length / 128), scratch = new Float32Array(128);
  const hist = new Float32Array(8), cos = new Float32Array(8), sin = new Float32Array(8);
  for (let start = 0; start < values.length; start += 128) {
    hist.fill(0);
    for (let cell = 0; cell < 16; cell++) for (let bin = 0; bin < 8; bin++) hist[bin] = f(hist[bin] + values[start + cell*8 + bin]);
    let turn = 0, best = -Infinity;
    for (let t = 0; t < 4; t++) { const energy = f(hist[2*t] + hist[2*t+1]); if (energy > best) {best = energy; turn = t;} }
    scratch.set(values.subarray(start, start + 128));
    for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) {
      const sx = turn === 1 ? 3-y : turn === 2 ? 3-x : turn === 3 ? y : x;
      const sy = turn === 1 ? x : turn === 2 ? 3-y : turn === 3 ? 3-x : y;
      for (let bin = 0; bin < 8; bin++) values[start + (y*4+x)*8+bin] = scratch[(sy*4+sx)*8+(bin+2*turn)%8];
    }
    hist.fill(0);
    for (let cell = 0; cell < 16; cell++) for (let bin = 0; bin < 8; bin++) hist[bin] = f(hist[bin] + values[start + cell*8 + bin]);
    const total = sumFloat32(hist, 0, 8);
    for (let bin = 0; bin < 8; bin++) {
      cos[bin] = f(hist[bin] * [1,0,-1,0,1,0,-1,0][bin]);
      sin[bin] = f(hist[bin] * [0,1,0,-1,0,1,0,-1][bin]);
    }
    const c = sumFloat32(cos,0,8), s = sumFloat32(sin,0,8);
    const anisotropy = f(Math.sqrt(f(f(c*c) + f(s*s))));
    diversity[start / 128] = total > 0 && f(total - anisotropy) >= f(f(.1) * f(total + anisotropy)) ? 1 : 0;
  }
  return diversity;
}

export function denseDescriptorShape(width, height, method, patch) {
  requireValue([width, height, patch].every(Number.isSafeInteger) && [0, 1].includes(method) && patch >= (method ? 3 : 2) && patch <= 32 && Math.min(width, height) > 3*patch, 'Invalid dense dimensions/settings.');
  const border = method ? 3*patch : 0;
  requireValue(width*height <= 0x7fffffff, 'Dense field exceeds 32-bit addressing.');
  return {width: width-border, height: height-border, dimensions: method ? 128 : 12, shift: method ? 1.5*patch : 0};
}
export function denseDescriptorHeapBound(width, height, method, patch, reflection = false) {
  const shape = denseDescriptorShape(width, height, method, patch), n = shape.width*shape.height;
  // Caller source + raw output coexist with native manager vectors, VLFeat
  // histograms/smoothing and reflection temporaries; JS copies are separate.
  const bytes = 32*1024**2 + width*height*160 + n*shape.dimensions*4*(reflection ? 5 : 3) + n*48;
  if (bytes > DENSE_HEAP_LIMIT) throw new EngineError('MEMORY_LIMIT', 'Dense descriptors need a segmented provider for this working set.');
  return bytes;
}

export function denseResidentHeapBound(width,height,patch,reflection=false){
 denseDescriptorShape(width,height,0,patch);const tile=Math.min(width,128+6*patch+2)*Math.min(height,128+6*patch+2),bytes=32*1024**2+width*height*(reflection?112:64)+tile*256;
 if(bytes>DENSE_HEAP_LIMIT)throw new EngineError('MEMORY_LIMIT','Resident global Zernike descriptors exceed WASM capacity.');return bytes;
}

// One instance per admitted worker/job owner. Calls are synchronous and may
// not overlap. A worker owner can terminate on cancellation during native work.
export async function createDenseMath(options = {}) {
  const {default: create} = await import('../vendor/dense/dense.js');
  const m = await create(options);
  const compactShapes=[null,null];let residentShape;
  const alloc = bytes => { const p = m._malloc(Math.max(1, bytes)); if (!p) throw new EngineError('MEMORY_LIMIT', 'Dense WASM allocation failed.'); return p; };
  const scope = action => {
    const pointers=[];
    const reserve = bytes => { const p=alloc(bytes); pointers.push(p); return p; };
    const stage = array => { const p=reserve(array.byteLength); m.HEAPU8.set(new Uint8Array(array.buffer,array.byteOffset,array.byteLength),p); return p; };
    try { return action(reserve, stage); } finally { for (const p of pointers) m._free(p); }
  };
  const status = (code, error) => { if (code) {const message=m.UTF8ToString(error)||'Dense calculation failed.';throw new EngineError(code===1?'CANCELLED':/bad_alloc|out of memory/i.test(message)?'MEMORY_LIMIT':'NUMERIC_RANGE',message);} };
  return {
    get heapBytes() { return m.HEAPU8.byteLength; },
    features(gray, width, height, {method=0, patch=8, reflection=false, normalize=true, signal}={}) {
      const shape=denseDescriptorShape(width,height,method,patch);
      requireValue(gray instanceof Float32Array && gray.length === width*height && typeof reflection === 'boolean' && typeof normalize === 'boolean' && gray.every(Number.isFinite), 'Invalid dense source.');
      denseDescriptorHeapBound(width,height,method,patch,reflection); checkAbort(signal);
      return scope((reserve,stage) => {
        const source=stage(gray), count=shape.width*shape.height*shape.dimensions;
        const first=reserve(count*4), second=reflection ? reserve(count*4) : 0, error=reserve(1024);
        status(m._sherloq_dense_features(source,width,height,method,patch,+reflection,first,second,error),error);checkAbort(signal);
        const a=m.HEAPF32.slice(first/4,first/4+count), b=second ? m.HEAPF32.slice(second/4,second/4+count) : a;
        if(normalize){normalizeDense(a,shape.dimensions);if(b!==a)normalizeDense(b,shape.dimensions);}
        return {...shape,first:a,second:b};
      });
    },
    residentPrepare(gray,width,height,{patch=8,reflection=false,signal}={}){
      const shape=denseDescriptorShape(width,height,0,patch);requireValue(gray instanceof Float32Array&&gray.length===width*height&&gray.every(Number.isFinite)&&typeof reflection==='boolean','Invalid resident Zernike input.');denseResidentHeapBound(width,height,patch,reflection);checkAbort(signal);residentShape=null;return scope((reserve,stage)=>{const source=stage(gray),error=reserve(1024);status(m._dense_resident_zernike(source,width,height,patch,+reflection,error),error);checkAbort(signal);residentShape=shape;return {...shape};});
    },
    residentUnpack(second,offset,length){requireValue(residentShape&&[0,1].includes(second)&&Number.isSafeInteger(offset)&&Number.isSafeInteger(length)&&offset>=0&&length>=0&&length<=8192&&offset+length<=residentShape.width*residentShape.height,'Invalid resident descriptor page.');return scope(reserve=>{const p=reserve(length*48);requireValue(m._dense_resident_unpack(second,offset,length,p)===0,'Invalid resident descriptor page.');return m.HEAPF32.slice(p/4,p/4+length*12);});},
    residentRelease(){m._dense_resident_release();residentShape=null;},
    residentField(mask,width,height,{minimum=5,radius=600,iterations=8,compare=false,seed=729,gap=[0,0],axes=null,signal}={}){
      const n=width*height;requireValue(residentShape?.width===width&&residentShape?.height===height&&mask instanceof Uint8Array&&mask.length===n&&mask.every(v=>v<=3),'Resident field shape mismatch.');
      requireValue([minimum,radius,...gap].every(Number.isFinite)&&minimum>=0&&radius>=minimum&&radius<=0x1fffffff&&gap.length===2&&gap.every(v=>Math.abs(v)<=0x1fffffff)&&Number.isInteger(iterations)&&iterations>=1&&iterations<=0x7fffffff&&Number.isInteger(seed)&&seed>=0&&seed<=0xffffffff&&typeof compare==='boolean','Invalid resident PatchMatch settings.');
      requireValue(!axes||axes.length===2&&axes.every((a,i)=>a instanceof Float32Array&&a.length===(i?height:width)&&a.every((v,j)=>Number.isFinite(v)&&(!j||v>=a[j-1])&&(!j||v-a[j-1]<=1.0001))),'Invalid resident axes.');checkAbort(signal);
      return scope((reserve,stage)=>{const allowed=stage(mask),targets=reserve(n*4),squared=reserve(n*4),count=reserve(8),error=reserve(1024),x=axes?stage(axes[0]):0,y=axes?stage(axes[1]):0;status(m._dense_resident_field(allowed,+compare,minimum,radius,iterations,seed,targets,squared,count,error,gap[0],gap[1],x,y),error);checkAbort(signal);return {width,height,targets:m.HEAP32.slice(targets/4,targets/4+n),distancesSquared:m.HEAPF32.slice(squared/4,squared/4+n),comparisons:BigInt(m.HEAPU32[count/4])+(BigInt(m.HEAPU32[count/4+1])<<32n)};});
    },
    compactPrepare(gray,width,height,{patch=8,reflection=false,quarterTurn=false,support=patch,slot=0,signal}={}) {
      const shape=denseDescriptorShape(width,height,1,support);
      requireValue([0,1].includes(slot)&&Number.isInteger(patch)&&patch>=3&&patch<=support&&(support-patch)%2===0&&typeof reflection==='boolean'&&typeof quarterTurn==='boolean'&&gray instanceof Float32Array&&gray.length===width*height&&gray.every(Number.isFinite),'Invalid compact SIFT preparation.');
      if(32*1024**2+width*height*180>DENSE_HEAP_LIMIT)throw new EngineError('MEMORY_LIMIT','Compact SIFT needs a stored complete-axis provider for this working set.');checkAbort(signal);compactShapes[slot]=null;
      return scope((reserve,stage)=>{const source=stage(gray),error=reserve(1024);status(m._dense_compact_prepare(source,width,height,patch,+reflection,+quarterTurn,support,slot,error),error);checkAbort(signal);compactShapes[slot]=shape;return {...shape};});
    },
    compactUnpack(slot,offset,length){const shape=compactShapes[slot];requireValue(shape&&Number.isSafeInteger(offset)&&Number.isSafeInteger(length)&&offset>=0&&length>=0&&offset+length<=shape.width*shape.height&&length<=8192,'Invalid compact descriptor page.');return scope(reserve=>{const p=reserve(length*128*4);if(m._dense_compact_unpack(slot,offset,length,p))throw new EngineError('INVALID_INPUT','Compact descriptor reconstruction failed.');return m.HEAPF32.slice(p/4,p/4+length*128);});},
    compactRelease(){m._dense_compact_release();compactShapes.fill(null);},
    compactField(mask,width,height,{second=0,minimum=5,radius=600,iterations=8,compare=false,seed=729,gap=[0,0],axes=null,cacheSlots=16384,signal}={}) {
      const count=width*height;
      requireValue(compactShapes[0]&&compactShapes[second]&&[compactShapes[0],compactShapes[second]].every(s=>s.width===width&&s.height===height)&&mask instanceof Uint8Array&&mask.length===count&&mask.every(v=>v<=3),'Compact field shape mismatch.');
      requireValue([minimum,radius,...gap].every(Number.isFinite)&&minimum>=0&&radius>=minimum&&radius<=0x1fffffff&&gap.length===2&&gap.every(v=>Math.abs(v)<=0x1fffffff)&&Number.isInteger(iterations)&&iterations>=1&&iterations<=0x7fffffff&&Number.isInteger(seed)&&seed>=0&&seed<=0xffffffff&&typeof compare==='boolean'&&Number.isInteger(cacheSlots)&&cacheSlots>=1&&cacheSlots<=262144,'Invalid compact PatchMatch settings.');
      requireValue(!axes||axes.length===2&&axes.every((a,i)=>a instanceof Float32Array&&a.length===(i?height:width)&&a.every((v,j)=>Number.isFinite(v)&&(!j||v>=a[j-1])&&(!j||v-a[j-1]<=1.0001))),'Invalid compact axes.');checkAbort(signal);
      return scope((reserve,stage)=>{const allowed=stage(mask),targets=reserve(count*4),squared=reserve(count*4),comparisons=reserve(8),error=reserve(1024),x=axes?stage(axes[0]):0,y=axes?stage(axes[1]):0;
       status(m._dense_compact_field(allowed,second,+compare,minimum,radius,iterations,seed,targets,squared,comparisons,error,gap[0],gap[1],x,y,cacheSlots),error);checkAbort(signal);
       return {width,height,targets:m.HEAP32.slice(targets/4,targets/4+count),distancesSquared:m.HEAPF32.slice(squared/4,squared/4+count),allowed:m.HEAPU8.slice(allowed,allowed+count),comparisons:BigInt(m.HEAPU32[comparisons/4])+(BigInt(m.HEAPU32[comparisons/4+1])<<32n)};
      });
    },
    coherence(targets, squared, width, height, {threshold=.3,errorThreshold=3,radius=6,minimum=6,signal}={}) {
      const n=width*height;
      requireValue(Number.isSafeInteger(width)&&Number.isSafeInteger(height)&&width>0&&height>0&&n<=0x7fffffff&&targets instanceof Int32Array&&targets.length===n&&squared instanceof Float32Array&&squared.length===n, 'Invalid coherence field.');
      requireValue(Number.isFinite(threshold)&&threshold>=0&&Number.isFinite(errorThreshold)&&errorThreshold>=0&&Number.isInteger(radius)&&radius>=1&&radius<=6&&Number.isInteger(minimum)&&minimum>=1&&minimum<=0x7fffffff, 'Invalid coherence settings.');
      requireValue(targets.every(t=>t>=-1&&t<n)&&squared.every(v=>v>=0), 'Invalid dense targets or distances.');
      if(n*64+32*1024**2>DENSE_HEAP_LIMIT)throw new EngineError('MEMORY_LIMIT','Dense coherence exceeds WASM staging capacity.');
      checkAbort(signal);
      return scope((reserve,stage)=>{
        const a=stage(targets),b=stage(squared),selected=reserve(n),errors=reserve(n*4),error=reserve(1024);
        status(m._sherloq_dense_coherence(a,b,width,height,threshold*threshold,errorThreshold,radius,minimum,selected,errors,error),error);checkAbort(signal);
        return {selected:m.HEAPU8.slice(selected,selected+n),errors:m.HEAPF32.slice(errors/4,errors/4+n)};
      });
    },
    field(first, second, mask, width, height, {dimensions=12,minimum=5,radius=600,iterations=8,compare=false,seed=729,gap=[0,0],axes=null,signal,bounded=true}={}) {
      const count=width*height;
      requireValue(Number.isSafeInteger(width)&&Number.isSafeInteger(height)&&width>0&&height>0&&count<=0x7fffffff && [12,128].includes(dimensions), 'Invalid dense field shape.');
      requireValue(first instanceof Float32Array&&second instanceof Float32Array&&first.length===count*dimensions&&second.length===first.length&&first.every(Number.isFinite)&&second.every(Number.isFinite)&&mask instanceof Uint8Array&&mask.length===count&&mask.every(v=>v<=3), 'Dense field array mismatch.');
      requireValue([minimum,radius,...gap].every(Number.isFinite)&&minimum>=0&&radius>=minimum&&radius<=0x1fffffff&&gap.every(v=>Math.abs(v)<=0x1fffffff)&&gap.length===2&&Number.isInteger(iterations)&&iterations>=1&&iterations<=0x7fffffff&&Number.isInteger(seed)&&seed>=0&&seed<=0xffffffff&&typeof compare==='boolean'&&typeof bounded==='boolean', 'Invalid PatchMatch settings.');
      requireValue(!axes || axes.length===2&&axes.every((a,i)=>a instanceof Float32Array&&a.length===(i?height:width)&&a.every((v,j)=>Number.isFinite(v)&&(!j||v>=a[j-1])&&(!j||v-a[j-1]<=1.0001))), 'Invalid compact coordinate axes.');
      const bytes=32*1024**2+first.byteLength+(first===second?0:second.byteLength)+count*18+(width+height)*4;
      if(bytes>DENSE_HEAP_LIMIT)throw new EngineError('MEMORY_LIMIT','Dense matching needs a segmented provider for this working set.');
      checkAbort(signal);
      return scope((reserve,stage)=>{
        const a=stage(first), b=first===second?a:stage(second), allowed=stage(mask), targets=reserve(count*4), squared=reserve(count*4), comparisons=reserve(8), error=reserve(1024);
        const x=axes?stage(axes[0]):0,y=axes?stage(axes[1]):0;
        status((bounded?m._sherloq_patchmatch_bounded:m._sherloq_patchmatch_metric)(a,b,allowed,width,height,dimensions,+compare,minimum,radius,iterations,seed,targets,squared,comparisons,0,error,gap[0],gap[1],x,y),error);checkAbort(signal);
        return {width,height,targets:m.HEAP32.slice(targets/4,targets/4+count),distancesSquared:m.HEAPF32.slice(squared/4,squared/4+count),comparisons:BigInt(m.HEAPU32[comparisons/4])+ (BigInt(m.HEAPU32[comparisons/4+1])<<32n)};
      });
    },
  };
}
export {sumFloat32 as denseSumFloat32};
