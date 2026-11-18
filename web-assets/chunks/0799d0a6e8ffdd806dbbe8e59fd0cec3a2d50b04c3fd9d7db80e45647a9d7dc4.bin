import "../../runtime-context.js?v=0.33.3";
import {allocateOwnedTypedArray} from './allocation.js';
import {EngineError,requireValue} from './errors.js';
import {withRetirementOwner} from './owner-retirement-error.js';
const acknowledged=value=>requireValue(value!==false&&value!==0,'Encoded source retirement was not acknowledged.');

export function encodedBytesSource(bytes) {
  requireValue(bytes instanceof Uint8Array && bytes.length > 0, 'Encoded bytes are required.');
  return {byteLength: bytes.length, externalOwnedBytes: bytes.byteLength,
    readInto(target, offset) {
      requireValue(target instanceof Uint8Array && Number.isSafeInteger(offset) && offset >= 0,
        'Invalid encoded read.');
      const length = Math.min(target.length, Math.max(0, bytes.length - offset));
      target.set(bytes.subarray(offset, offset + length)); return length;
    }};
}

/** One seekable, shared-budget RAM window. The backend is input storage, never
 * an image format or a second numerical engine. Node can fill the same buffer
 * directly; Blob/FileReaderSync supplies one separately admitted transient read. */
export function createCachedEncodedSource({byteLength, readInto, readChunk,
  budget, cacheBytes, owner = 'encoded-source', close = () => {}}) {
  requireValue(Number.isSafeInteger(byteLength) && byteLength > 0
    && Number.isSafeInteger(cacheBytes) && cacheBytes > 0
    && (typeof readInto === 'function' || typeof readChunk === 'function') && budget,
    'Invalid encoded source owner.');
  let capacity = Math.min(cacheBytes, byteLength), cache, transientRelease;
  let start = -1, valid = 0, disposed = false, retiring = false, backendClosed = false, closing, fills = 0, backendBytes = 0, deliveredBytes = 0;
  function allocate() {
    cache = allocateOwnedTypedArray(Uint8Array, capacity,
      {budget, owner, label: 'encoded-seek-cache'});
    if (!readInto) transientRelease = budget.reserve(capacity);
  }
  function alive() { if (disposed || retiring) throw new EngineError('DISPOSED', 'Encoded source disposed.'); }
  function fill(at) {
    if (!cache) allocate();
    const nextStart = Math.floor(at / capacity) * capacity;
    const nextValid = Math.min(capacity, byteLength - nextStart);
    valid = 0;
    const target = cache.data.subarray(0, nextValid);
    if (readInto) {
      let done = 0;
      while (done < nextValid) {
        const count = readInto(target.subarray(done), nextStart + done);
        requireValue(Number.isSafeInteger(count) && count > 0 && count <= nextValid - done,
          'Encoded source changed or returned an incomplete read.'); done += count;
      }
    } else {
      const bytes = readChunk(nextStart, nextValid);
      requireValue(bytes instanceof ArrayBuffer && bytes.byteLength === nextValid,
        'Encoded source changed or returned an incomplete read.');
      const backing = budget.registerBacking?.('array-buffer', bytes.byteLength,
        {owner, label: 'encoded-sync-read', identity: bytes});
      try { target.set(new Uint8Array(bytes)); }
      finally { const retired = backing?.(); if (retired !== 0)
        budget.notifyBackingRelease?.('array-buffer', retired ?? bytes.byteLength); }
    }
    start = nextStart; valid = nextValid;
    ++fills; backendBytes += nextValid;
  }
  function remaining() {
    if (cache) { acknowledged(cache.release()); cache = null; }
    if (transientRelease) { acknowledged(transientRelease()); transientRelease = null; }
    disposed = true;
  }
  function dispose() {
    if (disposed) return;
    retiring = true;
    if (closing) return closing;
    if (!backendClosed) {
      const value = close();
      if (value && typeof value.then === 'function') {
        closing = Promise.resolve(value).then(value => {
          acknowledged(value); backendClosed = true; remaining();
        }).finally(() => { closing = null; });
        return closing;
      }
      acknowledged(value); backendClosed = true;
    }
    remaining();
  }
  try { allocate(); }
  catch (primary) {
    let retirement;
    try { retirement = dispose(); }
    catch (cleanup) { throw withRetirementOwner(primary, {dispose}, cleanup); }
    if (retirement && typeof retirement.then === 'function') {
      retirement.catch(() => {});
      throw withRetirementOwner(primary, {dispose}, new EngineError('BUSY', 'Encoded input constructor cleanup is asynchronous.'));
    }
    throw primary;
  }
  return {
    byteLength, externalOwnedBytes: 0,
    readInto(target, offset) {
      alive(); requireValue(target instanceof Uint8Array && Number.isSafeInteger(offset)
        && offset >= 0, 'Invalid encoded source window.');
      const length = Math.min(target.length, Math.max(0, byteLength - offset));
      let done = 0;
      while (done < length) {
        const at = offset + done;
        if (at < start || at >= start + valid) fill(at);
        const count = Math.min(length - done, start + valid - at);
        target.set(cache.data.subarray(at - start, at - start + count), done); done += count;
      }
      deliveredBytes += length; return length;
    },
    resizeCache(admittedBytes) {
      alive(); requireValue(Number.isSafeInteger(admittedBytes) && admittedBytes > 0,
        'Invalid cache admission.');
      const next = Math.min(admittedBytes, byteLength); if (next === capacity) return;
      cache.release(); transientRelease?.(); cache = null; transientRelease = null;
      capacity = next; start = -1; valid = 0; allocate();
    },
    metrics() { return {capacity, cacheBytes: cache?.data.byteLength ?? 0,
      transientBytes: transientRelease ? capacity : 0, fills, backendBytes,
      deliveredBytes, wrapperEncodedCopyInWasm: false, disposed, retiring, backendClosed}; },
    dispose,
  };
}

export function createBlobEncodedSource(blob, options) {
  requireValue(blob && Number.isSafeInteger(blob.size) && typeof blob.slice === 'function'
    && typeof FileReaderSync === 'function', 'A dedicated worker Blob source is required.');
  const reader = new FileReaderSync();
  return createCachedEncodedSource({...options, byteLength: blob.size,
    readChunk: (offset, length) => reader.readAsArrayBuffer(blob.slice(offset, offset + length))});
}

export function mountEncodedSource(FS, source) {
  requireValue(FS && Number.isSafeInteger(source?.byteLength) && source.byteLength > 0
    && typeof source.readInto === 'function', 'A seekable encoded source is required.');
  const mountPoint = '/native-source';
  let failure,failed=false, directoryOwned=false, mounted=false, uncertainMount=false, closed=false;
  const filesystem = {mount(mount) {
    const root = FS.createNode(null, '/', 0o40555, 0);
    root.mount = mount;
    const file = FS.createNode(root, 'original', 0o100444, 0);
    const attribute = node => ({dev: 1, ino: node.id, mode: node.mode, nlink: 1,
      uid: 0, gid: 0, rdev: 0, size: node === root ? 4096 : source.byteLength,
      atime: new Date(0), mtime: new Date(0), ctime: new Date(0),
      blksize: 4096, blocks: Math.ceil(source.byteLength / 4096)});
    root.node_ops = {getattr: attribute, lookup(_node, name) {
      if (name !== 'original') throw new FS.ErrnoError(44); return file;
    }};
    file.node_ops = {getattr: attribute};
    file.stream_ops = {
      read(_stream, buffer, offset, length, position) {
        try { return source.readInto(new Uint8Array(buffer.buffer, buffer.byteOffset + offset, length), position); }
        catch (error) {if(!failed){failed=true;failure=error;}throw new FS.ErrnoError(29);}
      },
      llseek(stream, offset, whence) {
        const position = whence === 0 ? offset : whence === 1 ? stream.position + offset
          : whence === 2 ? source.byteLength + offset : -1;
        if (!Number.isSafeInteger(position) || position < 0) throw new FS.ErrnoError(28);
        return position;
      },
    };
    return root;
  }};
  const release = () => {
    if (closed) return;
    if (uncertainMount) {
      requireValue(typeof FS.lookupPath === 'function', 'A partial FS mount requires an observed retryable state.');
      const node=FS.lookupPath(mountPoint,{follow_mount:false}).node;
      mounted=!!node.mounted;uncertainMount=false;
    }
    if (mounted) { acknowledged(FS.unmount(mountPoint)); mounted=false; }
    if (directoryOwned) { acknowledged(FS.rmdir(mountPoint)); directoryOwned=false; }
    closed=true;source=null;
  };
  Object.defineProperties(release, {
    failure:{get:()=>failure},failed:{get:()=>failed},closed:{get:()=>closed}
  });
  let mountAttempted=false;
  try {
    try { acknowledged(FS.mkdir(mountPoint)); directoryOwned=true; }
    catch (error) { if (error?.errno !== 20) throw error; }
    mountAttempted=true;
    acknowledged(FS.mount(filesystem, {}, mountPoint)); mounted=true;
    return release;
  } catch (primary) {
    if (mountAttempted) uncertainMount=true;
    try { release(); }
    catch (cleanup) { throw withRetirementOwner(primary,{dispose:release},cleanup); }
    throw primary;
  }
}
