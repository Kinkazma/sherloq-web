// Pinned private CPU runtime, compiled from the original statistical method.
export const CPU_RUNTIME=Object.freeze({
 moduleURL:new URL('./cpu/stream-backend.mjs',import.meta.url).href,
 factory:'createStreamBackend',url:new URL('./cpu/stream-statistics.wasm',import.meta.url).href,
 bytes:110635,sha256:'6f5bf740cf3157501ac456b62368cbc1947f3cc65df11c6f8fdd71ba76dc3aac',
});
export const SCIENTIFIC_REVISION='splicebuster-f64-native-fma-group4-v1';
