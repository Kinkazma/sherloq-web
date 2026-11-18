import "../../runtime-context.js?v=0.33.3";
// Native typed decoder over the shared encoded source and cache owners.
import {encodedBytesSource,mountEncodedSource} from './encoded-source.js';
import {mountPixelCache} from './native-magick-cache-fs.js';
import {validateNative16SourceRead} from './native-magick-source-preflight.js';
const MiB = 1024 ** 2;
const abort = signal => {
  if (signal?.aborted) throw signal.reason ?? new DOMException('Aborted', 'AbortError');
};
const checked = (ok, module) => {
  if (!ok) throw new Error(module.UTF8ToString(module._native_magick_error()) || 'Native decoder failed.');
};

export async function createNativeMagickDecoder({
  moduleFactory, wasmBinary, maximumMemoryBytes, initialAdmittedBytes = 32 * MiB, bandBytes = 8 * MiB,
  routeEightBitToLegacy = false,
  createPixelCacheOwner,
}) {
  if (typeof moduleFactory !== 'function') throw new TypeError('moduleFactory is required.');
  if (!Number.isSafeInteger(maximumMemoryBytes) || maximumMemoryBytes < 32 * MiB
      || maximumMemoryBytes > 4 * 1024 * MiB) throw new RangeError('Invalid admitted WASM capacity.');
  if (!Number.isSafeInteger(bandBytes) || bandBytes < 1) throw new RangeError('Invalid admitted band capacity.');
  if (!Number.isSafeInteger(initialAdmittedBytes) || initialAdmittedBytes < 32 * MiB
      || initialAdmittedBytes > maximumMemoryBytes) throw new RangeError('Invalid bootstrap admission.');
  let memory = new WebAssembly.Memory({initial: 512, maximum: Math.floor(maximumMemoryBytes / 65536)});
  let admittedHeapBytes = initialAdmittedBytes;
  let grow = memory.grow.bind(memory);
  Object.defineProperty(memory, 'grow', {value: pages => {
    if (!Number.isSafeInteger(pages) || pages < 0 || memory.buffer.byteLength + pages * 65536 > admittedHeapBytes)
      throw new RangeError('Native Magick heap growth exceeds its admitted phase.');
    return grow(pages);
  }});
  let module = await moduleFactory({wasmMemory: memory, wasmBinary});
  let busy = false, disposed = false, heapCapacityBytes = memory.buffer.byteLength,
    pendingCache,pendingEncodedMount,cleanupError;
  checked(module._native_magick_init(), module);
  const quantumDepth = module._native_magick_quantum_depth(), quantumBytes = module._native_magick_quantum_bytes();
  if (!((quantumDepth === 16 && quantumBytes === 4) || (quantumDepth === 32 && quantumBytes === 8))) {
    module._native_magick_dispose(); throw new Error('The genuine HDRI quantum storage must match the selected numerical variant.');
  }
  const string = pointer => pointer ? module.UTF8ToString(pointer >>> 0) : null;
  const alloc = size => {
    const pointer = module._malloc(size) >>> 0;
    if (!pointer) throw new RangeError('The admitted decoder allocation failed.');
    return pointer;
  };
  const text = value => {
    const bytes = new TextEncoder().encode(value + '\0'), pointer = alloc(bytes.length);
    module.HEAPU8.set(bytes, pointer); return pointer;
  };
  const property = name => {
    const pointer = text(name);
    try { return string(module._native_magick_property(pointer)); }
    finally { module._free(pointer); }
  };
  const describe = () => {
    const model = module._native_magick_model(), alpha = Boolean(module._native_magick_alpha());
    const base = model === 4 ? 'CMYK' : model === 1 ? 'I' : 'RGB';
    const sourceDepth = module._native_magick_source_depth();
    const alphaDepth = module._native_magick_alpha_depth();
    const floating = Boolean(module._native_magick_source_float());
    const maximumSourceDepth = Math.max(sourceDepth, alphaDepth);
    const decodedSampleFormat = floating ? maximumSourceDepth > 32 ? 'float64' : 'float32'
      : maximumSourceDepth > 32 ? 'float64' : maximumSourceDepth > 16 ? 'uint32' : 'uint16';
    const profileLength = module._native_magick_profile_size() >>> 0;
    const chromaticities = property('native:chromaticities') === 'declared'
      ? Array.from({length: 8}, (_, i) => module._native_magick_chromaticity(i)) : undefined;
    return {
      width: module._native_magick_width(), height: module._native_magick_height(),
      orientation: module._native_magick_orientation() || 1,
      sourceDepth, alphaDepth, sourceSampleFormat: floating ? 'float' : 'uint',
      decodedSampleFormat,
      requiredQuantumDepth: floating || maximumSourceDepth > 16 ? 32 : 16,
      codecQuantumDepth: quantumDepth, codecQuantumBytes: quantumBytes,
      sourceIntegerPrecisionExact: !floating && Math.max(sourceDepth, alphaDepth) <= 16,
      ...(maximumSourceDepth > 32 ? {precisionLimitation: 'Float64 and wider integer source ranges do not yet have a qualified preservation contract.'}
        : maximumSourceDepth > 16 && !floating ? {precisionLimitation: 'This typed integer32 route still needs its own source-oracle qualification.'} : {}),
      model: model === 4 ? 'CMYK' : model === 1 ? 'GRAY' : 'RGB',
      layout: base + (alpha ? 'A' : ''), channels: model + (alpha ? 1 : 0),
      alpha, sourceColorSpace: string(module._native_magick_colorspace_name()),
      iccProfileLength: profileLength,
      ...(chromaticities ? {chromaticities} : {}),
      ...(property('heic:cicp') ? {cicp: property('heic:cicp')} : {}),
      precisionOrigin: 'decoder source metadata', frameSelection: 'first frame',
      decoder: string(module._native_magick_version()),
      orientationApplied: false, colorConversionApplied: false,
    };
  };
  const requireLive = signal => {
    abort(signal);
    if (disposed) throw new Error('Native decoder disposed.');
  };
  const invoke=(name,args=[])=>module._native_magick_async_cache
    ? module.ccall(name,'number',args.map(()=> 'number'),args,{async:true})
    : module['_'+name](...args);
  const releaseEncoded=async()=>{
    if(!pendingEncodedMount)return;
    const owner=pendingEncodedMount,value=await (typeof owner==='function'?owner():owner.dispose());
    if(value===false||value===0)throw value;
    if(pendingEncodedMount===owner)pendingEncodedMount=null;
  };
  const releaseCache=async()=>{
    if(!pendingCache)return;
    const current=pendingCache;await current.release();
    if(pendingCache===current)pendingCache=null;
  };
  return {
    async decode({bytes, source, format, signal, sourcePreflight, onInputAdmission, onHeader, onDecodedHeader, onBand}) {
      requireLive(signal);
      if (busy) throw new Error('The native codec owner is already in use.');
      if (!source) source = encodedBytesSource(bytes);
      if (!Number.isSafeInteger(source.byteLength) || source.byteLength < 1
          || typeof source.readInto !== 'function') throw new TypeError('A seekable encoded source is required.');
      if (!/^[A-Z0-9]+$/.test(format)) throw new TypeError('A structural coder identity is required.');
      if (typeof onHeader !== 'function' || typeof onBand !== 'function') throw new TypeError('Admission and band callbacks are required.');
      busy = true;
      let coder = 0, layout = 0, output = 0, unmount,cache,primaryFailed=false,deferredEncodedMount=false;
      const started = performance.now();
      let decodeMs = 0, exportMs = 0, sourceHeader;
      try {
        await releaseCache();await releaseEncoded();requireLive(signal);
        if (onInputAdmission) {
          const inputAdmission = await onInputAdmission({encodedOwnedBytes: 0,
            encodedSourceBytes: source.byteLength, externalEncodedSourceOwnedBytes: source.externalOwnedBytes ?? 0,
            codecHeapCapacityBytes: memory.buffer.byteLength});
          requireLive(signal);
          if (!Number.isSafeInteger(inputAdmission?.codecHeapBytes)
              || inputAdmission.codecHeapBytes < memory.buffer.byteLength
              || inputAdmission.codecHeapBytes > maximumMemoryBytes) throw new RangeError('Invalid input admission.');
          admittedHeapBytes = inputAdmission.codecHeapBytes;
        }
        try{unmount=mountEncodedSource(module.FS,source);pendingEncodedMount=unmount;}
        catch(error){if(error?.cleanupOwner?.dispose){pendingEncodedMount=error.cleanupOwner;deferredEncodedMount=true;}throw error;}
        coder = text(format);
        const checkRead = ok => {
          if(unmount.failed)throw unmount.failure;
          if(cache?.failed)throw cache.failure;
          checked(ok,module);
        };
        checked(module._native_magick_set_budget(admittedHeapBytes - 1), module);
        if(sourcePreflight){
          const p=sourcePreflight;
          if(!['sherloq.existing-q8-preflight/1','sherloq.existing-native16-preflight/1'].includes(p.schema)||p.preservationQualified!==false
            ||!['uint16','float32'].includes(p.decodedSampleFormat)
            ||![p.width,p.height,p.channels].every(v=>Number.isSafeInteger(v)&&v>0)
            ||!Number.isSafeInteger(p.width*p.height*5*8)
            ||!Number.isInteger(p.orientation)||p.orientation<1||p.orientation>8
            ||!['I','IA','RGB','RGBA','CMYK','CMYKA'].includes(p.layout)
            ||p.layout.length!==p.channels||p.requiredQuantumDepth!==quantumDepth)
            throw new TypeError('The existing Q8 preflight differs from the admitted HP representation.');
          if(p.schema==='sherloq.existing-native16-preflight/1'
            &&(p.precisionOrigin!=='same-existing-native16-header'||p.sourceSampleFormat!=='uint'
              ||p.sourceDepth!==16||p.decodedSampleFormat!=='uint16'||p.requiredQuantumDepth!==16))
            throw new TypeError('The captured native16 header differs from its source precision.');
          sourceHeader={...p,codecQuantumDepth:quantumDepth,codecQuantumBytes:quantumBytes};
        }else{
          checkRead(await invoke('native_magick_probe_file',[coder]));
          sourceHeader = describe();
        }
        if (routeEightBitToLegacy && sourceHeader.sourceSampleFormat === 'uint'
            && Math.max(sourceHeader.sourceDepth, sourceHeader.alphaDepth) <= 8)
          return {header: sourceHeader, requiresLegacy8: true,
            metrics: {probeOnly: true, codecHeapCapacityBytes: memory.buffer.byteLength,
              totalMs: performance.now() - started}};
        if (sourceHeader.requiredQuantumDepth > quantumDepth)
          return {header: sourceHeader, requiresQuantumDepth: sourceHeader.requiredQuantumDepth,
            metrics: {probeOnly: true, codecHeapCapacityBytes: memory.buffer.byteLength,
              totalMs: performance.now() - started}};
        const maximumExternalBandBytes = Math.max(
          Math.min(bandBytes, sourceHeader.width * sourceHeader.height * 5 * 8),
          sourceHeader.width * 5 * 8);
        const admission = await onHeader({...sourceHeader,
          encodedOwnedBytes: 0, encodedSourceBytes: source.byteLength,
          externalEncodedSourceOwnedBytes: source.externalOwnedBytes ?? 0,
          codecHeapCapacityBytes: memory.buffer.byteLength,
          maximumExternalBandBytes});
        requireLive(signal);
        const cacheMemoryBytes = admission?.cacheMemoryBytes;
        if (!Number.isSafeInteger(cacheMemoryBytes) || cacheMemoryBytes < 1
            || cacheMemoryBytes >= maximumMemoryBytes) throw new RangeError('A real cache-memory admission is required.');
        if (!Number.isSafeInteger(admission?.codecHeapBytes)
            || admission.codecHeapBytes < memory.buffer.byteLength
            || admission.codecHeapBytes > maximumMemoryBytes) throw new RangeError('A real decoder-heap admission is required.');
        admittedHeapBytes = admission.codecHeapBytes;
        if (!Number.isSafeInteger(admission?.externalBandBytes)
            || admission.externalBandBytes < maximumExternalBandBytes) throw new RangeError('The external band copy has not been admitted.');
        if(createPixelCacheOwner) {
          if(!module._native_magick_async_cache||!module._native_magick_set_cache_budget)
            throw new Error('This decoder was not built with the paged cache transport.');
          if(!Number.isSafeInteger(admission.cacheBackingBytes)||admission.cacheBackingBytes<1)
            throw new RangeError('The logical cache backing has not been admitted.');
          const owner=await createPixelCacheOwner({header:sourceHeader,admission,signal});
          pendingCache={release:()=>owner.dispose()};
          try{cache=mountPixelCache(module.FS,module,owner,{signal});pendingCache=cache;}
          catch(error){if(error?.cleanupOwner?.dispose)pendingCache={release:()=>error.cleanupOwner.dispose()};throw error;}
          requireLive(signal);
          checked(module._native_magick_set_cache_budget(cacheMemoryBytes,admission.cacheBackingBytes),module);
        } else checked(module._native_magick_set_budget(cacheMemoryBytes), module);
        let at = performance.now();
        checkRead(await invoke('native_magick_open_file',[coder]));
        decodeMs = performance.now() - at;
        requireLive(signal);
        const header = describe();
        if(sourcePreflight&&(header.decodedSampleFormat!==sourcePreflight.decodedSampleFormat
          ||header.layout!==sourcePreflight.layout||header.channels!==sourcePreflight.channels
          ||header.requiredQuantumDepth>quantumDepth))
          throw new Error('The useful native Read did not establish the preflight sample representation.');
        validateNative16SourceRead(sourcePreflight,header);
        if(sourcePreflight){
          // Ping is an admission fact, not the owner of the exported grid.
          // HP exports remain source-native: no autoOrient is performed here.
          if(![header.width,header.height].every(v=>Number.isSafeInteger(v)&&v>0)
            ||header.width*header.height!==sourceHeader.width*sourceHeader.height
            ||!Number.isInteger(header.orientation)||header.orientation<1||header.orientation>8)
            throw new Error('The native Read grid exceeds the admitted source pixel product.');
          header.admissionGrid={width:sourceHeader.width,height:sourceHeader.height,orientation:sourceHeader.orientation,owner:sourcePreflight.schema==='sherloq.existing-native16-preflight/1'?'existing-native16-header':'existing-q8-ping'};
          header.gridOwner='native-read-before-orientation';
          header.maximumExternalBandBytes=Math.max(Math.min(bandBytes,header.width*header.height*5*8),header.width*5*8);
        }else if (sourceHeader.width !== header.width || sourceHeader.height !== header.height
            || sourceHeader.orientation !== header.orientation) throw new Error('Native source grid changed after admission.');
        let metadataPhase = true;
        try {
          const refinedAdmission=await onDecodedHeader?.(header, {readColorProfileInto(target) {
            if (!metadataPhase) throw new Error('The private profile borrow has ended.');
            requireLive(signal);
            const length = module._native_magick_profile_size() >>> 0, at = module._native_magick_profile_data() >>> 0;
            if (!(target instanceof Uint8Array) || target.length !== length)
              throw new RangeError('An owned profile destination of the exact size is required.');
            target.set(module.HEAPU8.subarray(at, at + length)); return target;
          }});
          if(sourcePreflight&&header.maximumExternalBandBytes>admission.externalBandBytes
            &&(!Number.isSafeInteger(refinedAdmission?.externalBandBytes)||refinedAdmission.externalBandBytes<header.maximumExternalBandBytes))
            throw new RangeError('The useful Read row exceeds its external transport admission.');
        } finally { metadataPhase = false; }
        requireLive(signal);
        const formats = {
          uint16: {Type: Uint16Array, storage: 0}, float32: {Type: Float32Array, storage: 1},
          float64: {Type: Float64Array, storage: 2}, uint32: {Type: Uint32Array, storage: 3},
        };
        const {Type, storage} = formats[header.decodedSampleFormat], componentBytes = Type.BYTES_PER_ELEMENT;
        const rowBytes = header.width * header.channels * componentBytes;
        if (!Number.isSafeInteger(rowBytes) || rowBytes < 1) throw new RangeError('Invalid source row size.');
        const rowsPerBand = Math.max(1, Math.min(header.height, Math.floor(bandBytes / rowBytes)));
        const capacity = rowsPerBand * rowBytes;
        output = alloc(capacity); layout = text(header.layout);
        let bands = 0;
        for (let y = 0; y < header.height; y += rowsPerBand) {
          requireLive(signal);
          const rows = Math.min(rowsPerBand, header.height - y);
          at = performance.now();
          checkRead(await invoke('native_magick_export',[y,rows,layout,storage,output]));
          const count = header.width * rows * header.channels;
          const samples = new Type(module.HEAPU8.buffer, output, count).slice();
          exportMs += performance.now() - at;
          await onBand({x: 0, y, width: header.width, rows, samples, layout: header.layout});
          requireLive(signal);
          ++bands;
        }
        return {header, metrics: {decodeMs, exportMs, totalMs: performance.now() - started,
          bands, exportedBytes: header.width * header.height * header.channels * componentBytes,
          wrapperEncodedCopyBytes: 0,
          codecHeapCapacityBytes: memory.buffer.byteLength,
          ...(cache?{cacheType:module._native_magick_cache_type(),cacheBacking:cache.metrics()}:{}),
          precision: header.decodedSampleFormat, colorConversionApplied: false, additionalNativeProbe:!sourcePreflight, ...(sourcePreflight?{sourcePreflightOrigin:sourcePreflight.precisionOrigin??'same-existing-q8-ping'}:{})}};
      } catch(error) {primaryFailed=true;throw error;
      } finally {
        let failed=false,failure;
        for(const close of [()=>invoke('native_magick_close'),
          ...[output,layout,coder].filter(Boolean).map(pointer=>()=>module._free(pointer)),
          ...(deferredEncodedMount?[]:[releaseEncoded]),releaseCache]) {
          try{await close();}catch(error){if(!failed){failed=true;failure=error;}}
        }
        heapCapacityBytes=memory.buffer.byteLength;busy=false;
        if(failed){cleanupError=failure;if(!primaryFailed)throw failure;}
      }
    },
    metrics() { return {busy, disposed, codecHeapCapacityBytes: memory?.buffer.byteLength ?? heapCapacityBytes,
      cacheRetirementPending:!!pendingCache,encodedMountRetirementPending:!!pendingEncodedMount,...(cleanupError?{cleanupError:String(cleanupError.message??cleanupError).slice(0,1024)}:{})}; },
    async dispose() {
      if(!module)return;
      if (busy) throw new Error('Abort or finish the active decode before retiring its worker owner.');
      disposed=true;if(pendingCache)await releaseCache();await releaseEncoded();
      module._native_magick_dispose();
      heapCapacityBytes = memory.buffer.byteLength;
      module = null; memory = null; grow = null;
    },
  };
}
