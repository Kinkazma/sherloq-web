"""Build the offline detector parity probe; never writes runtime assets."""
from pathlib import Path
import argparse, os, re, shlex, subprocess
root = Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser()
parser.add_argument('--native-orb', action='store_true')
parser.add_argument('--native-brisk', action='store_true')
parser.add_argument('--native-brisk-area', action='store_true', help='Offline BRISK interpolation study; angles remain unqualified')
parser.add_argument('--capture-brisk-directions', action='store_true', help='Record integer orientation vectors for the native atan2f oracle')
args = parser.parse_args()
compiler = Path(os.environ['EMSDK'])/'upstream/emscripten/em++'
assert '4.0.15' in subprocess.check_output([str(compiler), '--version'], text=True).splitlines()[0]
subprocess.run(['python3', str(root/'scripts/build-cloning-sort.py')], check=True)
command = [str(compiler), str(root/'experiments/cloning/features.cpp')]
selected = ['orb', 'brisk'] if args.native_brisk or args.native_brisk_area else ['orb'] if args.native_orb else []
if args.capture_brisk_directions and not args.native_brisk_area:
    parser.error('--capture-brisk-directions requires --native-brisk-area')
if args.native_brisk_area:
    command += [str(root/'experiments/cloning/brisk-area.cpp')]
if args.capture_brisk_directions:
    command += [str(root/'experiments/cloning/brisk-directions.cpp')]
for detector in selected:
    source = root/f'.build/opencv-4.11.0/modules/features2d/src/{detector}.cpp'
    original = source.read_text()
    if detector == 'orb':
        old = 'pts[ptidx].angle = fastAtan2((float)m_01, (float)m_10);'
        assert original.count(old) == 1
        original = original.replace(old, 'pts[ptidx].angle = cloningNativeAngle((float)m_01, (float)m_10);')
        implementation = (root/'experiments/cloning/angle.inc').read_text()
        original = original.replace('#include <iterator>', '#include <iterator>\n'+implementation)
    if detector == 'brisk' and args.native_brisk_area:
        original = original.replace('namespace cv\n{', 'namespace cv\n{\nvoid cloningBriskArea(const Mat&,Mat&);', 1)
        old = 'resize(srcimg, dstimg, dstimg.size(), 0, 0, INTER_AREA);'
        assert original.count(old) == 2
        original = original.replace(old, 'cloningBriskArea(srcimg, dstimg);')
        if args.capture_brisk_directions:
            original = original.replace('namespace cv\n{', 'extern "C" void brisk_capture(int,int);\nnamespace cv\n{', 1)
            old = 'kp.angle = (float)(atan2'
            assert original.count(old) == 1
            original = original.replace(old, 'brisk_capture(direction0,direction1);\n        '+old)
    suffix = 'directions' if args.capture_brisk_directions else 'area' if args.native_brisk_area else 'reference'
    generated = root/f'.build/cloning-{detector}-{suffix}.cpp'; generated.write_text(original)
    build = root/'.build/cv/modules/features2d'
    flags = (build/'CMakeFiles/opencv_features2d.dir/flags.make').read_text()
    options = []
    for key in ['CXX_DEFINES','CXX_INCLUDES','CXX_FLAGS']:
        options += shlex.split(re.search('^'+key+r' = (.*)$', flags, re.M)[1])
    options = ['-ffp-contract=on' if x == '-ffp-contract=off' else x for x in options]
    llvm = root/f'.build/cloning-{detector}-{suffix}.ll'
    subprocess.run([str(compiler), *options, '-I', str(source.parent), '-S', '-emit-llvm', str(generated), '-o', str(llvm)], cwd=build, check=True)
    ir = llvm.read_text(); count = ir.count('@llvm.fmuladd.'); assert count > 0
    llvm.write_text(ir.replace('@llvm.fmuladd.', '@llvm.fma.'))
    output = root/f'.build/cloning-{detector}-{suffix}.o'
    subprocess.run([str(compiler), '-O3', '-c', str(llvm), '-o', str(output)], check=True)
    print(count, detector, 'reference contractions made explicit')
    command += [str(output)]
for name in ['features2d', 'flann', 'imgproc', 'core']:
    command += [str(root/f'.build/cv/lib/libopencv_{name}.a'), '-I', str(root/f'.build/opencv-4.11.0/modules/{name}/include')]
exports = ['malloc','free','features_detect','features_points','features_descriptors','features_descriptor_size','features_select','features_match','features_match_direct','features_matches','features_render','features_output','features_count','features_compactness','features_norm','features_heap_fallbacks','features_release']
if args.capture_brisk_directions:
    exports += ['brisk_reset','brisk_values','brisk_direction_count','brisk_angle']
import json
variant = 'brisk-directions' if args.capture_brisk_directions else 'brisk-area' if args.native_brisk_area else 'native-brisk' if args.native_brisk else 'native-orb' if args.native_orb else None
command += [str(root/'.build/cv/3rdparty/lib/libzlib.a'), '-I', str(root/'.build/cv'), '-I', str(root/'.build'), '-O3', '-fexceptions', '-ffp-contract=off',
            '-ffile-prefix-map='+str(root)+'/=','-sDISABLE_EXCEPTION_CATCHING=0',
            '-sMODULARIZE=1', '-sEXPORT_ES6=1', '-sENVIRONMENT=web,worker,node',
            '-sALLOW_MEMORY_GROWTH=1', '-sINITIAL_MEMORY=33554432', '-sMAXIMUM_MEMORY=1073741824',
            '-sFILESYSTEM=0', '-sEXPORTED_FUNCTIONS='+json.dumps(['_'+name for name in exports]),
            '-sEXPORTED_RUNTIME_METHODS=["HEAPU8","HEAPF64"]', '-o', str(root/'.build'/('cloning-features'+('-'+variant if variant else '')+'.mjs'))]
subprocess.run(command, check=True)
