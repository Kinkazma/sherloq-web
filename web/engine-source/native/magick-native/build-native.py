"""Build the isolated Q16-HDRI import candidate; never edits SHERLOQ sources.

Run fetch-sources.py first. EMSDK must identify Emscripten4.0.15. Jobs default
to2 and are capped at2; no deadline cancels the build. Delegate archives are
immutable official bootstrap inputs, with pinned source reconstruction scripts.
"""
from pathlib import Path
import hashlib, json, os, shutil, subprocess, sys

ROOT = Path(os.environ['NATIVE_MAGICK_BUILD_ROOT']).resolve()
SDK = Path(os.environ['EMSDK']).resolve()
IM = ROOT / 'sources/imagemagick'
QUANTUM = 32 if '--quantum32' in sys.argv else 16
PAGED_CACHE = '--paged-cache' in sys.argv
SUFFIX = '-q32' if QUANTUM == 32 else ''
BUILD = ROOT / ('build' + SUFFIX)
PREFIX = ROOT / ('prefix' + SUFFIX)
DEPS = ROOT / 'dependencies'
LOCAL_DEPS = ROOT / 'dependencies-local'
JOBS = str(max(1, min(2, int(os.environ.get('CODEC_BUILD_JOBS', '2')))))
FLAGS = ['-O3', '-msimd128', '-fexceptions', '-fPIC',
         '-ffile-prefix-map=' + str(ROOT) + '/=native-magick-build/']
ENV = {**os.environ, 'EM_CONFIG': os.environ.get('EM_CONFIG', str(SDK / '.emscripten')),
       'EMCC_CORES': JOBS, 'BINARYEN_CORES': JOBS, 'CMAKE_BUILD_PARALLEL_LEVEL': JOBS}
ENV['PATH'] = str(SDK / 'upstream/emscripten') + os.pathsep + ENV['PATH']
CC, CXX = SDK / 'upstream/emscripten/emcc', SDK / 'upstream/emscripten/em++'
if '4.0.15' not in subprocess.check_output([str(CC), '--version'], env=ENV, text=True):
    raise ValueError('Emscripten4.0.15 is required.')
for record in json.loads((ROOT / 'SOURCE-ARCHIVES.json').read_text()).values():
    name = record['url'].split('/')[-1]
    archive = next(p for p in (ROOT / 'archives').iterdir()
                   if hashlib.sha256(p.read_bytes()).hexdigest() == record['sha256'])
    if archive.stat().st_size != record['bytes']: raise ValueError('Archive length differs')
patches = json.loads((ROOT / 'SOURCE-PATCHES.json').read_text())
for name, record in patches.items():
    if hashlib.sha256((IM / name).read_bytes()).hexdigest() != record['afterSha256']:
        raise ValueError('Apply the checked source-metadata patch before compiling: ' + name)
if not LOCAL_DEPS.exists():
    shutil.copytree(DEPS, LOCAL_DEPS)
for pattern in ['lib/pkgconfig/*.pc', 'lib/*.la']:
    for p in LOCAL_DEPS.glob(pattern):
        p.write_text(p.read_text().replace('/tmp/dependencies', str(LOCAL_DEPS)))
ENV.update({
    'CC': str(CC), 'CXX': str(CXX), 'AR': str(SDK / 'upstream/emscripten/emar'),
    'RANLIB': str(SDK / 'upstream/emscripten/emranlib'),
    'CFLAGS': ' '.join(FLAGS), 'CXXFLAGS': ' '.join(FLAGS),
    'CPPFLAGS': '-I' + str(LOCAL_DEPS / 'include'),
    'LDFLAGS': '-L' + str(LOCAL_DEPS / 'lib'), 'LIBS': '-lc++',
    'PKG_CONFIG_PATH': str(LOCAL_DEPS / 'lib/pkgconfig'),
    'PKG_CONFIG_LIBDIR': str(LOCAL_DEPS / 'lib/pkgconfig'),
    'EM_PKG_CONFIG_PATH': str(LOCAL_DEPS / 'lib/pkgconfig'),
})
BUILD.mkdir(exist_ok=True)
PREFIX.mkdir(exist_ok=True)
def run(args, cwd=BUILD):
    subprocess.run([str(x) for x in args], env=ENV, cwd=cwd, check=True)

if not (BUILD / 'Makefile').exists():
    print('PHASE configure Q' + str(QUANTUM), flush=True)
    run([SDK / 'upstream/emscripten/emconfigure', IM / 'configure',
         '--host=wasm32-unknown-emscripten', '--prefix=' + str(PREFIX),
         '--disable-shared', '--enable-static', '--without-modules',
         '--with-quantum-depth=' + str(QUANTUM), '--enable-hdri', '--disable-openmp',
         '--without-threads', '--disable-opencl', '--disable-dpc',
         '--disable-assert', '--disable-deprecated', '--without-utilities',
         '--without-magick-plus-plus', '--disable-docs', '--without-perl',
         '--without-x', '--without-rsvg', '--without-gslib', '--without-gvc',
         '--without-fontconfig', '--without-freetype', '--without-pango',
         '--without-lqr', '--without-raw', '--without-xml', '--without-lzma',
         '--without-bzlib', '--without-zstd', '--with-heic', '--with-jxl',
         '--with-openjp2', '--with-openexr', '--with-png', '--with-tiff',
         '--with-jpeg', '--with-lcms', '--with-webp'])
# Configuration constants are runtime strings, not __FILE__ references: the
# compiler's prefix-map flag alone cannot remove their private build prefix.
generated_header = BUILD / 'MagickCore/magick-baseconfig.h'
header_before = generated_header.read_text()
runtime_prefix = json.loads((ROOT / 'QUALIFIED.json').read_text())['runtimeConfigurationPrefix'][str(QUANTUM)]
if runtime_prefix not in ('/sherloq/native-magick', '/sherloq/native-magick/Q32'):
    raise ValueError('Unexpected qualified virtual configuration prefix')
header_after = header_before.replace(str(PREFIX), runtime_prefix)
if header_before != header_after:
    generated_header.write_text(header_after)
if '--configure-only' in sys.argv: sys.exit(0)
if '--link-only' not in sys.argv:
    print('PHASE compile-install Core Q' + str(QUANTUM), flush=True)
    run(['make', '-j' + JOBS, 'install'])
OUT = ROOT / ('output' + SUFFIX + ('-paged' if PAGED_CACHE else ''))
OUT.mkdir(exist_ok=True)
obj = BUILD / ('native-magick-paged.o' if PAGED_CACHE else 'native-magick.o')
wrapper_flags = ['-DSHERLOQ_PAGED_CACHE=1'] if PAGED_CACHE else []
print('PHASE compile wrapper/bridge Q' + str(QUANTUM), flush=True)
run([CC, '-c', ROOT / 'native-magick.c', '-o', obj, *FLAGS,
     *wrapper_flags,
     '-DMAGICKCORE_QUANTUM_DEPTH=' + str(QUANTUM), '-DMAGICKCORE_HDRI_ENABLE=1',
     '-I' + str(PREFIX / 'include/ImageMagick-7')])
extra_objects, async_flags = [], []
if PAGED_CACHE:
    bridge = BUILD / 'native-cache-io.o'
    run([CC, '-c', ROOT / 'native-cache-io.c', '-o', bridge, *FLAGS])
    extra_objects.append(bridge)
    async_flags = ['-sASYNCIFY=1', '-sASYNCIFY_STACK_SIZE=1048576',
        '-sASYNCIFY_IMPORTS=["native_cache_read","native_cache_write"]',
        *['-Wl,--wrap=__wasi_fd_' + operation for operation in ['read','write','pread','pwrite']]]
libs = ['heif', 'aom', 'de265', 'jxl', 'jxl_threads', 'jxl_cms', 'hwy',
        'brotlienc', 'brotlidec', 'brotlicommon', 'OpenEXR-3_5',
        'OpenEXRUtil-3_5', 'OpenEXRCore-3_5', 'Imath-3_2', 'Iex-3_5',
        'IlmThread-3_5', 'openjph', 'tiff', 'webpmux', 'webpdemux', 'webp',
        'sharpyuv', 'png', 'jpeg', 'turbojpeg', 'openjp2', 'lcms2', 'zstd', 'z']
print('PHASE link Asyncify Q' + str(QUANTUM), flush=True)
run([CXX, obj, *extra_objects, PREFIX / ('lib/libMagickCore-7.Q' + str(QUANTUM) + 'HDRI.a'), *FLAGS,
     '-Wl,--start-group',
     *[LOCAL_DEPS / ('lib/lib' + name + '.a') for name in libs],
     '-Wl,--end-group', '-sMODULARIZE=1', '-sEXPORT_ES6=1',
     '-sEXPORT_NAME=createNativeMagick', '--bind', '-sENVIRONMENT=web,worker,node',
     '-sALLOW_MEMORY_GROWTH=1', '-sABORTING_MALLOC=0', '-sIMPORTED_MEMORY=1',
     '-sINITIAL_MEMORY=33554432', '-sMAXIMUM_MEMORY=4294967296',
     '-sSTACK_SIZE=2097152', '-sFILESYSTEM=1', '-sDYNAMIC_EXECUTION=0',
     '-sEXPORTED_FUNCTIONS=["_malloc","_free"]',
     '-sEXPORTED_RUNTIME_METHODS=["UTF8ToString","HEAPU8","FS","ccall"]',
     *async_flags,
     '-o', OUT / 'native-magick.mjs'])
files = {p.name: {'bytes': p.stat().st_size,
                 'sha256': hashlib.sha256(p.read_bytes()).hexdigest()}
         for p in OUT.glob('native-magick.*') if p.is_file()}
for p in OUT.glob('native-magick.*'):
    if any(marker in p.read_bytes() for marker in [b'/Users/', b'coordination-private']):
        raise ValueError('A private build prefix survived in a runtime resource: ' + p.name)
(OUT / 'BUILD.json').write_text(json.dumps({
    'schema': 'sherloq.native-magick-candidate/1',
    'productionIntegration': False, 'quantumDepth': QUANTUM, 'hdri': True,
    'pagedCacheTransport': PAGED_CACHE,
    'toolchain': 'Emscripten4.0.15', 'jobs': int(JOBS),
    'flags': [flag.replace(str(ROOT), '<BUILD_ROOT>') for flag in FLAGS],
    'sourceReferences': json.loads((ROOT / 'SOURCE-REFS.json').read_text()),
    'archives': json.loads((ROOT / 'SOURCE-ARCHIVES.json').read_text()),
    'patches': patches, 'wrapperSha256': hashlib.sha256((ROOT / 'native-magick.c').read_bytes()).hexdigest(),
    **({'cacheBridgeSha256': hashlib.sha256((ROOT/'native-cache-io.c').read_bytes()).hexdigest(),
        'asyncifyFlags': async_flags} if PAGED_CACHE else {}),
    'files': files,
}, indent=2) + '\n')
print(json.dumps(files, indent=2))
