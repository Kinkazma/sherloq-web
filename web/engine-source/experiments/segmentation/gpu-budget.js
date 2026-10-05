// Admission for actual WebGPU buffers. A parent worker reserves this entire
// ceiling globally; this local budget enforces it for the runtime's allocations.
import {EngineError, requireValue} from '../../src/errors.js';

export function boundGpuAdapter(adapter, budget) {
  requireValue(adapter && typeof adapter.requestDevice === 'function' && budget?.reserve, 'GPU adapter and admitted budget required');
  const devices = [], buffers = new Set(), frees = new Set(), errors = [];
  const pending = promise => {frees.add(promise); promise.then(() => frees.delete(promise), () => frees.delete(promise));};
  const counters = {allocations: 0, writeBufferBytes: 0, readMappingBytes: 0};
  const requestDevice = adapter.requestDevice.bind(adapter);
  adapter.requestDevice = async (descriptor = {}) => {
    // The grouped-Concats graph uses at most seven input storage bindings and
    // one output. Request the standard eight, not a vendor/brand-specific path.
    descriptor = {...descriptor, requiredLimits: {...descriptor.requiredLimits, maxStorageBuffersPerShaderStage: 8}};
    const device = await requestDevice(descriptor); devices.push(device);
    device.addEventListener('uncapturederror', event => {if (errors.length < 16) errors.push(String(event.error.message));});
    const create = device.createBuffer.bind(device), destroyDevice = device.destroy.bind(device), write = device.queue.writeBuffer.bind(device.queue);
    device.queue.writeBuffer = (buffer, offset, data, dataOffset = 0, size) => {
      const unit = data.BYTES_PER_ELEMENT ?? 1;
      counters.writeBufferBytes += (size ?? data.byteLength / unit - dataOffset) * unit;
      return write(buffer, offset, data, dataOffset, size);
    };
    device.createBuffer = descriptor => {
      const bytes = Math.ceil(Number(descriptor.size) / 4) * 4;
      requireValue(Number.isSafeInteger(bytes) && bytes >= 0, 'GPU buffer length');
      const release = budget.reserve(bytes); let buffer;
      try {buffer = create(descriptor);} catch (error) {release(); throw error;}
      const entry = {device, release}; buffers.add(entry); counters.allocations++;
      const free = () => {if (buffers.delete(entry)) release();}; entry.free = free;
      const destroy = buffer.destroy.bind(buffer), map = buffer.mapAsync.bind(buffer);
      buffer.destroy = () => {destroy(); pending(device.queue.onSubmittedWorkDone().then(free, free));};
      buffer.mapAsync = (mode, offset = 0, size) => {if (mode & GPUMapMode.READ) counters.readMappingBytes += size ?? buffer.size - offset; return map(mode, offset, size);};
      return buffer;
    };
    device.destroy = () => {destroyDevice(); pending(device.lost.then(() => {for (const entry of buffers) if (entry.device === device) entry.free();}));};
    return device;
  };
  return {
    adapter,
    snapshot() {return {...counters, ...budget.snapshot(), devices: devices.length, errors: errors.slice()};},
    async begin() {for (const device of devices) device.pushErrorScope('validation');},
    async end() {
      for (const device of devices) {
        await device.queue.onSubmittedWorkDone();
        const error = await device.popErrorScope(); if (error && errors.length < 16) errors.push(String(error.message));
      }
      if (errors.length) throw new EngineError('GPU_FAILED', 'WebGPU validation failed; output discarded: ' + errors[0]);
    },
    async dispose() {
      for (const device of devices) device.destroy();
      await Promise.allSettled(frees); adapter.requestDevice = requestDevice;
      // Device loss is the lifetime boundary, not an assertion about driver RSS.
      for (const entry of buffers) entry.free();
    }
  };
}
