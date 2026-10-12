// Exact source align_corners float32/FMA interpolation through an existing
// qualified PyTorch primitive, followed by source pad80 and unfused normalize.
// The current reused primitive explicitly supports dimensions2..1024 only.
import {allocateTypedArray,wasmAllocationFailure} from './allocation.js';
import {requireValue} from './errors.js';
export function prepareProposalPyramid(rgb, width, height, scale, module) {
  const outputWidth = Math.floor(width * scale), outputHeight = Math.floor(height * scale);
  const plane = width * height, outputPlane = outputWidth * outputHeight;
  requireValue(rgb instanceof Uint8Array&&rgb.length===plane*3&&[width,height,outputWidth,outputHeight].every(value=>Number.isSafeInteger(value)&&value>=2&&value<=1024)&&outputWidth+outputHeight>128,'Qualified RGB pyramid geometry');
  const input = module._malloc(plane * 3 * 4), output = module._malloc(outputPlane * 3 * 4);
  if (!input || !output) {if (input) module._free(input); if (output) module._free(output); throw wasmAllocationFailure(module,'Proposal pyramid scratch allocation failed.',(plane+outputPlane)*3*4);}
  try {
    for (let i = 0; i < plane; i++) for (let c = 0; c < 3; c++) module.HEAPF32[input / 4 + c * plane + i] = Math.fround(rgb[i * 3 + c] / 255);
    requireValue(module._d2prl_resize_large(input, 3, height, width, outputHeight, outputWidth, output),'Pyramid source dimensions are outside the explicitly qualified resize primitive');
    const paddedHeight = outputHeight + 160, paddedWidth = outputWidth + 160;
    const paddedPlane = paddedHeight * paddedWidth, result = allocateTypedArray(Float32Array,paddedPlane*3,{label:'selfdm-proposal-pyramid-output'});
    const mean = new Float32Array([.485, .456, .406]), std = new Float32Array([.229, .224, .225]);
    for (let c = 0; c < 3; c++) {
      const padding = Math.fround(Math.fround(.5 - mean[c]) / std[c]);
      result.fill(padding, c * paddedPlane, (c + 1) * paddedPlane);
      for (let y = 0; y < outputHeight; y++) for (let x = 0; x < outputWidth; x++) {
        const value = module.HEAPF32[output / 4 + c * outputPlane + y * outputWidth + x];
        result[c * paddedPlane + (y + 80) * paddedWidth + x + 80] = Math.fround(Math.fround(value - mean[c]) / std[c]);
      }
    }
    return {data: result, shape: [1, 3, paddedHeight, paddedWidth]};
  } finally {module._free(input); module._free(output);}
}
