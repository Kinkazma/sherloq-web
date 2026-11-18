import "../../runtime-context.js?v=0.33.3";
import {requireValue} from './errors.js';
import {MEDIA_RESOURCE_PINS, NATIVE_MAGICK_RESOURCE_METADATA} from './media-resource-integrity.js';

export function nativeMagickResource(quantumDepth) {
  requireValue(quantumDepth === 16 || quantumDepth === 32, 'Unknown native Magick precision.');
  const metadata = NATIVE_MAGICK_RESOURCE_METADATA[quantumDepth];
  const wasm = MEDIA_RESOURCE_PINS[metadata.wasmResourceId];
  return Object.freeze({...metadata, wasmURL: wasm.url, wasmBytes: wasm.bytes, wasmSha256: wasm.sha256});
}
