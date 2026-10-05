// Experimental scientific preparation from already-decoded, qualified RGB8.
// It never decodes or rewrites original file bytes or applies Canvas transforms.
import {requireValue, checkAbort, controlCheckpoint, EngineError} from '../../src/errors.js';
import {validateRgbRows} from '../../src/rgb-row-source.js';
const PAGE = 16 * 1024 ** 2, MAX = 512 * 1024 ** 2, OUTPUT = 3 * 448 * 448 * 4;
export async function createPreparation(factory, {budget} = {}) {
  requireValue(budget && typeof budget.reserve === 'function', 'Shared budget required');
  const resident = [budget.reserve(PAGE)]; let module, accounted = PAGE, busy = false, disposed = false;
  try { module = await factory(); requireValue(module.HEAPU8.length <= accounted, 'Initial preparation heap'); }
  catch (error) { resident.pop()(); throw error; }
  return {
    async runRows({readRows,width,height},{signal,onProgress,rowsPerRead}={}) {
      if (busy) throw new EngineError('BUSY', 'Preparation busy');
      requireValue(!disposed && typeof readRows === 'function' && [width,height].every(n=>Number.isSafeInteger(n)&&n>0&&n<=131072), 'Qualified RGB row-source geometry required');
      requireValue(rowsPerRead===undefined||Number.isSafeInteger(rowsPerRead)&&rowsPerRead>0, 'Preparation row group');
      const rows=Math.min(height,rowsPerRead??Math.max(1,Math.floor(262144/width)),Math.floor(32*1024**2/width));
      const stride=n=>2*Math.ceil(Math.max(1,Math.fround(n/448)))+1,tableBytes=n=>448*(stride(n)+2)*4;
      const inputBytes=width*rows*3,normalizedBytes=inputBytes*4,rowBytes=3*rows*448*4,horizontalBytes=3*height*448*4;
      const required=inputBytes+normalizedBytes+rowBytes+horizontalBytes+OUTPUT+tableBytes(width)+tableBytes(height)+PAGE,target=Math.max(accounted,Math.ceil(required/PAGE)*PAGE);
      if(target>MAX)throw new EngineError('MEMORY_LIMIT','Row preparation exceeds helper heap limit');
      checkAbort(signal);busy=true;const pointers=[];let borrowed,outputRelease,complete=false,reads=0,readMs=0,normalizeMs=0,horizontalMs=0,verticalMs=0;
      const began=performance.now();let stamp=began;const checkpoint=async()=>{if(performance.now()-stamp>=8){await controlCheckpoint(signal);stamp=performance.now();}};
      try{
        // The provider owns its window lease; this additional reservation covers
        // the borrowed RGB band while the preparation helper uses it.
        borrowed=budget.reserve(inputBytes);outputRelease=budget.reserve(OUTPUT);
        if(target>accounted){resident.push(budget.reserve(target-accounted));accounted=target;}
        const allocate=bytes=>{const ptr=module._malloc(bytes);if(ptr)pointers.push(ptr);requireValue(ptr>0&&module.HEAPU8.length<=accounted,'Preparation allocation');return ptr;};
        const ip=allocate(inputBytes),normalized=allocate(normalizedBytes),rowOutput=allocate(rowBytes),horizontal=allocate(horizontalBytes);
        const table=n=>{const starts=allocate(448*4),counts=allocate(448*4),weights=allocate(448*stride(n)*4);requireValue(module._d2prl_aa_coefficients(n,448,starts,counts,weights)===stride(n),'AA coefficients rejected');return{starts,counts,weights,stride:stride(n)};};
        const cx=width===448?null:table(width);
        for(let y=0;y<height;y+=rows){
          await checkpoint();checkAbort(signal);const count=Math.min(rows,height-y),pixels=width*count;let window;
          try{
            let at=performance.now();window=await readRows(y,count,{signal});const rgb=validateRgbRows(window,width,count);checkAbort(signal);module.HEAPU8.set(rgb,ip);readMs+=performance.now()-at;reads++;
            at=performance.now();for(let start=0;start<pixels;start+=65536){requireValue(module._d2prl_rgb_normalize(ip,pixels,start,Math.min(start+65536,pixels),normalized)===1,'Normalization rejected');await checkpoint();}normalizeMs+=performance.now()-at;
            at=performance.now();if(cx)for(let row=0;row<3*count;row+=8){requireValue(module._d2prl_aa_rows(normalized,3,count,width,448,1,row,Math.min(row+8,3*count),cx.starts,cx.counts,cx.weights,cx.stride,1,rowOutput)===1,'Horizontal resize rejected');await checkpoint();}
            const source=cx?rowOutput:normalized;
            for(let c=0;c<3;c++){const from=source+c*count*448*4;module.HEAPU8.copyWithin(horizontal+(c*height+y)*448*4,from,from+count*448*4);}horizontalMs+=performance.now()-at;
          }finally{window?.release?.();}
          onProgress?.({phase:'preparation-rows',completed:y+count,total:height});
        }
        let source=horizontal;checkAbort(signal);const at=performance.now();
        if(height!==448){const cy=table(height),out=allocate(OUTPUT);for(let row=0;row<3*448;row+=8){requireValue(module._d2prl_aa_rows(horizontal,3,height,448,448,0,row,Math.min(row+8,3*448),cy.starts,cy.counts,cy.weights,cy.stride,1,out)===1,'Vertical resize rejected');await checkpoint();}source=out;}
        verticalMs=performance.now()-at;checkAbort(signal);const data=module.HEAPF32.slice(source/4,source/4+OUTPUT/4);complete=true;
        return{data,shape:[1,3,448,448],release:outputRelease,metrics:{totalMs:performance.now()-began,readMs,normalizeMs,horizontalMs,verticalMs,sourceReads:reads,rowsPerRead:rows,horizontalBytes,heapCapacityBytes:module.HEAPU8.length,admittedHeapBytes:accounted}};
      }finally{for(const ptr of pointers)module._free(ptr);borrowed?.();if(!complete)outputRelease?.();busy=false;}
    },
    async run({rgb, height, width}, {signal} = {}) {
      if (busy) throw new EngineError('BUSY', 'Preparation busy');
      requireValue(!disposed && rgb instanceof Uint8Array && [height, width].every(n => Number.isInteger(n) && n > 0 && n <= 8192) && height * width <= 32 * 1024 ** 2 && rgb.length === 3 * height * width, 'Qualified RGB8 geometry required');
      const stride = n => 2 * Math.ceil(Math.max(1, Math.fround(n / 448))) + 1;
      const tableBytes = n => 448 * (stride(n) + 2) * 4;
      const normalizedBytes = rgb.length * 4, horizontalBytes = width === 448 ? 0 : 3 * height * 448 * 4, outputBytes = height === 448 ? 0 : OUTPUT;
      const required = rgb.byteLength + normalizedBytes + horizontalBytes + outputBytes + tableBytes(width) + tableBytes(height) + PAGE;
      const target = Math.max(accounted, Math.ceil(required / PAGE) * PAGE);
      if (target > MAX) throw new EngineError('MEMORY_LIMIT', 'Preparation exceeds helper heap limit');
      checkAbort(signal); busy = true; const pointers = []; let borrowed, outputRelease, complete = false;
      let stamp = performance.now(); const checkpoint = async () => { if (performance.now() - stamp >= 8) { await controlCheckpoint(signal); stamp = performance.now(); } };
      try {
        borrowed = budget.reserve(rgb.byteLength); outputRelease = budget.reserve(OUTPUT);
        if (target > accounted) { resident.push(budget.reserve(target - accounted)); accounted = target; }
        const allocate = bytes => { const ptr = module._malloc(bytes); if (ptr) pointers.push(ptr); requireValue(ptr > 0 && module.HEAPU8.length <= accounted, 'Preparation allocation'); return ptr; };
        const ip = allocate(rgb.byteLength), normalized = allocate(normalizedBytes); module.HEAPU8.set(rgb, ip);
        for (let start = 0; start < height * width; start += 65536) {
          requireValue(module._d2prl_rgb_normalize(ip, height * width, start, Math.min(start + 65536, height * width), normalized) === 1, 'Normalization rejected'); await checkpoint();
        }
        const table = n => {
          const starts = allocate(448 * 4), counts = allocate(448 * 4), weights = allocate(448 * stride(n) * 4);
          requireValue(module._d2prl_aa_coefficients(n, 448, starts, counts, weights) === stride(n), 'AA coefficients rejected'); return {starts, counts, weights, stride: stride(n)};
        };
        let source = normalized;
        for (const axis of [1, 0]) {
          const n = axis === 1 ? width : height; if (n === 448) continue;
          const coefficients = table(n), out = allocate(axis === 1 ? horizontalBytes : outputBytes), rows = 3 * (axis === 1 ? height : 448);
          for (let row = 0; row < rows; row += 8) {
            requireValue(module._d2prl_aa_rows(source, 3, height, axis === 1 ? width : 448, 448, axis, row, Math.min(row + 8, rows), coefficients.starts, coefficients.counts, coefficients.weights, coefficients.stride, 1, out) === 1, 'Antialias resize rejected'); await checkpoint();
          }
          source = out;
        }
        checkAbort(signal); const data = module.HEAPF32.slice(source / 4, source / 4 + OUTPUT / 4); complete = true;
        return {data, shape: [1, 3, 448, 448], release: outputRelease};
      } finally { for (const ptr of pointers) module._free(ptr); borrowed?.(); if (!complete) outputRelease?.(); busy = false; }
    },
    dispose() { requireValue(!busy, 'Preparation busy'); if (disposed) return; disposed = true; module = null; for (const free of resident) free(); }
  };
}
