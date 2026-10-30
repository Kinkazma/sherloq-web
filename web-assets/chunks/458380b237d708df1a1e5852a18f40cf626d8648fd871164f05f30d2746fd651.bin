import "../../runtime-context.js?v=0.30.0";
import {fetchM3Asset} from './m3-asset.js';
import {requireValue} from './errors.js';
export const XFEAT_GLUE_GLOBAL_ASSETS=Object.freeze({
  "attention": {
    "path": "../vendor/xfeat-glue-global/attention.onnx",
    "bytes": 693,
    "sha256": "7abe328a98e4bd211800809ad52bff8783c9029affb4b7c79337f74cca8ec204"
  },
  "log-assignment": {
    "path": "../vendor/xfeat-glue-global/log-assignment.onnx",
    "bytes": 520,
    "sha256": "a604bd199a5c91f065ddcf4aa125ec7df939241d266db5545096f001566bc196"
  },
  "dot": {
    "path": "../vendor/xfeat-glue-global/dot.onnx",
    "bytes": 323,
    "sha256": "1f9a6438c12f93e802e531ac8c4f0eae9cbaf1d28da073452023f8a4b48268c4"
  },
  "softmax": {
    "path": "../vendor/xfeat-glue-global/softmax.onnx",
    "bytes": 422,
    "sha256": "35c437672000db7b67ed3527fd5174d81062986bba9d15da4524bd609ca991a5"
  },
  "value": {
    "path": "../vendor/xfeat-glue-global/value.onnx",
    "bytes": 302,
    "sha256": "3fdef118307d19149ea0bb342b4be52c771ea7b1fd35333ed04e01f68d2dd3ef"
  },
  "cross-dot-fma": {
    "path": "../vendor/xfeat-glue-global/cross-dot-fma.wasm",
    "bytes": 1275,
    "sha256": "2059df60f7956d75d8fd9ffb24f8d24bcb570b82cfc061d5420597275a1899ae"
  },
  "cross-dot-relaxed-fma": {
    "path": "../vendor/xfeat-glue-global/cross-dot-relaxed-fma.wasm",
    "bytes": 823,
    "sha256": "232e41958d3a8430d4ed4c434cabef107a69d70b40372abf8e796746a2e3a695"
  }
});
export function fetchXfeatGlueAsset(name,signal){const pin=XFEAT_GLUE_GLOBAL_ASSETS[name];requireValue(pin,'Unknown global XFeat operator resource.');return fetchM3Asset(new URL(pin.path,import.meta.url),pin,signal);}
