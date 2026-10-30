"""Build dimension-extended helpers separately from the unchanged448 binaries."""
from pathlib import Path
import argparse,hashlib,json,os,subprocess
parser=argparse.ArgumentParser();parser.add_argument('--base',type=Path);args=parser.parse_args()
root=Path(__file__).resolve().parents[1];base=args.base or root
compiler=Path(os.environ['EMSDK'])/'upstream/emscripten/em++'
version=subprocess.check_output([str(compiler),'--version'],text=True).splitlines()[0]
assert '4.0.15' in version,version
out=root/'vendor/d2prl/dynamic';out.mkdir(parents=True,exist_ok=True)
exports={
 'prepare':['malloc','free','d2prl_rgb_normalize','d2prl_aa_coefficients','d2prl_aa_rows','d2prl_noaa_rows'],
 'feature-math':['malloc','free','d2prl_resize_large','d2prl_batchnorm_parameters','d2prl_affine','d2prl_reflect','d2prl_magnitude','d2prl_half_bits'],
 'neural-math':['malloc','free','d2prl_batchnorm_parameters','d2prl_affine','d2prl_mean_planes','d2prl_sigmoid_values','d2prl_pointwise','d2prl_nearest2','d2prl_maxpool','d2prl_pointconv4_probe','d2prl_pointconv_probe','d2prl_sum_all'],
 'dlf':['malloc','free','d2prl_dlf_range','d2prl_dlf_scores'],
}
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
for name,names in exports.items():
 source=root/'experiments/d2prl'/f'{name}.cpp';maximum=4294967296 if name=='feature-math' else 536870912 if name in ['prepare','dlf'] else 2147483648
 subprocess.run([str(compiler),str(source),'-I'+str(base/'experiments/d2prl'),'-O3','-ffp-contract=off','-ffile-prefix-map='+str(root)+'/=','-ffile-prefix-map='+str(base)+'/=','-sMODULARIZE=1','-sEXPORT_ES6=1','-sENVIRONMENT=web,worker,node','-sFILESYSTEM=0','-sABORTING_MALLOC=0','-sALLOW_MEMORY_GROWTH=1','-sINITIAL_MEMORY=16777216','-sMAXIMUM_MEMORY='+str(maximum),'-sMEMORY_GROWTH_LINEAR_STEP=16777216','-sEXPORTED_FUNCTIONS='+json.dumps(['_'+n for n in names]),'-sEXPORTED_RUNTIME_METHODS=["HEAPU8","HEAPF32","HEAP32"]','-o',str(out/f'{name}.js')],check=True)
files={p.name:{'bytes':p.stat().st_size,'sha256':sha(p)} for p in sorted(out.glob('*')) if p.stem in exports and p.suffix in ['.js','.wasm']}
(out/'PINNED.json').write_text(json.dumps({'schema':1,'compiler':version,'inputSides':[896,1344,1792],'base448RuntimeChanged':False,'initialMemoryBytes':16777216,'memoryMaximumBytes':{'prepare':536870912,'dlf':536870912,'feature-math':4294967296,'neural-math':2147483648},'policy':'Only spatial dimension guards extended; original numerical statements retained.','files':files},indent=2)+'\n')
