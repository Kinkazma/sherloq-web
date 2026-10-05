"""Recreate pre-integration research overlays from the immutable M1.44 sources.

Run the separate addnoise GPU postprocessor builder first. No model asset is
generated or copied here. Current dot helper keeps the constructor-cleanup fix;
historical report SHA describe the earlier exact bytes, not a new timing claim.
"""
from pathlib import Path
import subprocess

root = Path(__file__).resolve().parents[1]
def baseline(file):
    return subprocess.check_output(['git', 'show', '66cb0ba:'+file], cwd=root, text=True)
def replace(source, old, new):
    assert source.count(old) == 1, old
    return source.replace(old, new)

source = baseline('experiments/segmentation/cmseg-correlation-gpu.js')
source = replace(source, "import {createConvolutionGeneralGpu} from '../d2prl/convolution-general-gpu.js';", "import {createCmsegDotGpu} from './cmseg-dot-gpu.js';")
source = replace(source, 'gpu=await createConvolutionGeneralGpu({budget});', 'gpu=await createCmsegDotGpu({budget,input:normalized,c,h,w,rowsPerJob});')
source = replace(source, ',weights=new Float32Array(size*c),bias=new Float32Array(size);\n                for(let j=0;j<size;j++)for(let channel=0;channel<c;channel++)weights[j*c+channel]=normalized[channel*n+first+j];', ';')
source = replace(source, 'gpu.run({input:normalized,weights,bias,channels:c,height:h,width:w,outChannels:size,kernel:1,hasBias:true}', 'gpu.run({first,count:size}')
source = replace(source, 'gpuWriteBytes+=normalized.byteLength+weights.byteLength+bias.byteLength+72;gpuReadBytes+=size*n*4;gpuPeak=Math.max(gpuPeak,normalized.byteLength+weights.byteLength+bias.byteLength+2*size*n*4+72);gpuAllocations+=7;', 'gpuWriteBytes+=dots.timings.gpuWriteBytes;gpuReadBytes+=dots.timings.gpuReadBytes;gpuPeak=Math.max(gpuPeak,dots.gpu.peakAccountedBytes);gpuAllocations+=dots.gpu.allocations;')
output = root/'.build/cmseg-dot-resident'
output.mkdir(exist_ok=True)
(output/'cmseg-correlation-gpu.js').write_text(source)

source = baseline('experiments/segmentation/cmseg-inference.js')
source = replace(source, "backend==='cpu'||model.backbone", "backend==='cpu'||model.backbone||model.correlationGpuOnly")
source = replace(source, "enabled:backend==='webgpu'", "enabled:backend==='webgpu'&&!!model.backbone")
source = replace(source, "new URL('../../vendor/segmentation/cmseg-correlation-gpu/post.js',import.meta.url)", "new URL(model.backbone?'../../vendor/segmentation/cmseg-correlation-gpu/post.js':'../../.build/cmseg-addnoise-gpu-post-32m/post.js',import.meta.url)")
source = replace(source, '}:undefined,sessionCache:', "}:correlationGpuAllocations?{devices:1,simultaneousDeviceMaximum:1,allocations:correlationGpuAllocations,peakAccountedBytes:correlationGpuPeak,accounting:'explicit GPU buffers, excludes driver/compiler residency',errors:[]}:undefined,sessionCache:")
output = root/'.build/cmseg-addnoise-candidate'
output.mkdir(exist_ok=True)
(output/'cmseg-inference.js').write_text(source)
print('Research overlays recreated; delivered runtime unchanged')
