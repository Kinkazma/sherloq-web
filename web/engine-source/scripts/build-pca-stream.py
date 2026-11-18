from pathlib import Path
import argparse,os,subprocess,shutil
root=Path(__file__).resolve().parents[1];parser=argparse.ArgumentParser();parser.add_argument('--license-root',type=Path,default=root/'vendor');args=parser.parse_args();compiler=Path(os.environ['EMSDK'])/'upstream/emscripten/em++';out=root/'vendor/pca-stream';out.mkdir(parents=True,exist_ok=True)
assert '4.0.15' in subprocess.check_output([str(compiler),'--version'],text=True).splitlines()[0]
functions=['malloc','free','pca_stream_mean','pca_stream_cov','pca_stream_cov_range','pca_stream_finish','pca_stream_project','pca_stream_project_cached','pca_stream_normalize','pca_stream_lut','pca_stream_mean16','pca_stream_cov16','pca_stream_cov_range16','pca_stream_project16','pca_stream_project_cached16','pca_stream_normalize16','pca_stream_lut16']
import json
subprocess.run([str(compiler),str(root/'native/pca-stream.cpp'),'-O3','-ffp-contract=off','-ffile-prefix-map='+str(root)+'/=','-sMODULARIZE=1','-sEXPORT_ES6=1','-sENVIRONMENT=web,worker,node','-sFILESYSTEM=0','-sALLOW_MEMORY_GROWTH=1','-sINITIAL_MEMORY=8388608','-sMAXIMUM_MEMORY=67108864','-sMEMORY_GROWTH_LINEAR_STEP=4194304','-sABORTING_MALLOC=0','-sEXPORTED_FUNCTIONS='+json.dumps(['_'+f for f in functions]),'-sEXPORTED_RUNTIME_METHODS=["HEAPU8","HEAPF64"]','-o',str(out/'pca-stream.js')],check=True)
shutil.copyfile(args.license_root/'quality/LICENSE',out/'LICENSE-MUSL.txt');shutil.copyfile(args.license_root/'opencv/LICENSE',out/'LICENSE-OPENCV.txt')
