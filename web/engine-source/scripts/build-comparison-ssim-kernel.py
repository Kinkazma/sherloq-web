"""Verify the exact binary64 SSIM Gaussian coefficients in the GPU source.

Requires the same Emscripten4.0.15/OpenCV4.11 build as comparison-stream.
Generates only a bounded verification helper under .build, not new weights.
"""
from pathlib import Path
import os,subprocess,json,re
root=Path(__file__).resolve().parents[1]
external=Path(os.environ['OPENCV_BUILD_ROOT'])
compiler=Path(os.environ['EMSDK'])/'upstream/emscripten/em++'
assert '4.0.15' in subprocess.check_output([str(compiler),'--version'],text=True).splitlines()[0]
work=root/'.build/comparison-ssim-kernel';work.mkdir(parents=True,exist_ok=True)
source=work/'kernel.cpp'
source.write_text('#include <opencv2/imgproc.hpp>\nextern "C" double* gaussian_kernel(){static cv::Mat k=cv::getGaussianKernel(11,1.5,CV_64F);return k.ptr<double>();}\n')
includes=[external/f'opencv-4.11.0/modules/{name}/include' for name in ['core','imgproc']]+[external/'cv']
libraries=[external/'cv/lib/libopencv_imgproc.a',external/'cv/lib/libopencv_core.a',external/'cv/3rdparty/lib/libzlib.a']
subprocess.run([str(compiler),str(source),*map(str,libraries),*[arg for p in includes for arg in ['-I',str(p)]],'-O3','-fexceptions','-ffile-prefix-map='+str(root)+'/=','-sDISABLE_EXCEPTION_CATCHING=0','-sMODULARIZE=1','-sEXPORT_ES6=1','-sENVIRONMENT=node','-sEXPORTED_FUNCTIONS=["_gaussian_kernel"]','-sEXPORTED_RUNTIME_METHODS=["HEAPU8"]','-o',str(work/'kernel.mjs')],check=True)
script="""import create from './kernel.mjs';import{readFile}from'node:fs/promises';const m=await create({wasmBinary:await readFile('./kernel.wasm')}),at=m._gaussian_kernel();console.log(JSON.stringify([...new Uint32Array(m.HEAPU8.buffer,at,22)]));"""
actual=json.loads(subprocess.check_output(['node','--input-type=module','-e',script],cwd=work,text=True))
text=(root/'src/comparison-ssim-gpu.js').read_text()
expected=[int(v)for v in re.search(r'const kernelBits=Uint32Array.from\(\[([^]]+)\]\)',text).group(1).split(',')]
assert actual==expected,'Pinned binary64 Gaussian coefficients changed; do not round them to f32.'
print('Verified22 binary64 words from pinned OpenCV4.11 getGaussianKernel(11,1.5).')
