#!/usr/bin/env python3
"""Reconstruct the complete Q8 Magick.Native pair with bounded Ping metadata.

Only pinned public archives and public npm dependencies are used. No GitHub
Packages credentials are required. Outputs stay in the caller's build folder.
"""
from pathlib import Path
import argparse,hashlib,json,os,re,shutil,subprocess,tarfile,urllib.request,zipfile

HERE=Path(__file__).resolve().parent
ENGINE=HERE.parent.parent
PATCHES=ENGINE/'native/magick-source-metadata'
def digest(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def fail(message):raise ValueError(message)
def arguments():
 p=argparse.ArgumentParser(description=__doc__)
 p.add_argument('--work-dir',type=Path,required=True)
 p.add_argument('--emsdk',type=Path,default=os.environ.get('EMSDK'))
 p.add_argument('--archive-dir',type=Path,action='append',default=[])
 p.add_argument('--jobs',type=int,default=2)
 p.add_argument('--offline',action='store_true')
 p.add_argument('--prepare-only',action='store_true')
 return p.parse_args()

def rebuild(a):
 for name,pin in json.loads((PATCHES/'PATCH-PINS.json').read_text()).items():
  file=PATCHES/name
  if file.stat().st_size!=pin['bytes']or digest(file)!=pin['sha256']:fail('Reconstruction source differs: '+name)
 root=a.work_dir.resolve();root.mkdir(parents=True,exist_ok=True)
 archives=root/'archives';archives.mkdir(exist_ok=True)
 pins=json.loads((PATCHES/'SOURCE-ARCHIVES.json').read_text())
 for name,pin in pins.items():
  target=archives/(name+('.zip' if pin['url'].endswith('.zip') else '.tar.gz'))
  if not target.exists():
   found=next((p for folder in a.archive_dir for p in folder.iterdir() if p.is_file() and p.stat().st_size==pin['bytes'] and digest(p)==pin['sha256']),None)
   if found:shutil.copyfile(found,target)
   elif a.offline:fail('Pinned archive is absent: '+name)
   else:
    temporary=target.with_suffix(target.suffix+'.partial')
    try:
     with urllib.request.urlopen(pin['url'])as response,temporary.open('wb')as out:shutil.copyfileobj(response,out)
     if temporary.stat().st_size!=pin['bytes']or digest(temporary)!=pin['sha256']:fail('Downloaded archive differs: '+name)
     temporary.replace(target)
    finally:temporary.unlink(missing_ok=True)
  if target.stat().st_size!=pin['bytes']or digest(target)!=pin['sha256']:fail('Pinned archive differs: '+name)
 def extract(name,target):
  if target.exists():return
  target.mkdir(parents=True)
  with tarfile.open(archives/(name+'.tar.gz'))as tar:
   prefix=tar.getmembers()[0].name.split('/')[0]+'/'
   for member in tar.getmembers():
    if member.name==prefix[:-1]:continue
    if not member.name.startswith(prefix):fail('Unexpected source archive root')
    member.name=member.name[len(prefix):]
    if member.name:tar.extract(member,target,filter='data')
 sources=root/'sources';sources.mkdir(exist_ok=True)
 im=sources/'imagemagick';native=sources/'magick-native';sdk=sources/'magick-wasm';deps=root/'dependencies'
 for name,target in [('imagemagick',im),('magick-native',native),('magick-wasm',sdk),('dependencies-source',sources/'dependencies-source')]:extract(name,target)
 if not deps.exists():
  deps.mkdir()
  with zipfile.ZipFile(archives/'wasm-x86-static.zip')as z:
   for item in z.infolist():
    destination=(deps/item.filename).resolve()
    if not destination.is_relative_to(deps.resolve()):fail('Unsafe delegate archive path')
   z.extractall(deps)
 for pattern in ['lib/pkgconfig/*.pc','lib/*.la']:
  for file in deps.glob(pattern):file.write_text(file.read_text().replace('/tmp/dependencies',str(deps)))
 def patch(target,name):
  marker=target/('.sherloq-'+name+'.applied')
  identity=digest(PATCHES/'patches'/name)
  if marker.exists():
   if marker.read_text().strip()!=identity:fail('Build folder contains another patch revision: '+name)
   return
  subprocess.run(['patch','--batch','-p1','-i',str(PATCHES/'patches'/name)],cwd=target,check=True)
  marker.write_text(identity+'\n')
 patch(im,'imagemagick-source-metadata.patch')
 shutil.copyfile(PATCHES/'source-samples-private.h',im/'MagickCore/source-samples-private.h')
 for name,pin in json.loads((PATCHES/'IMAGE-METADATA-PATCHES.json').read_text()).items():
  if digest(im/name)!=pin['afterSha256']:fail('Patched coder differs: '+name)
 patch(native,'magick-native-configurable-prefixes.patch')
 patch(sdk,'magick-wasm-source-metadata.patch')
 for name in ['source-sample-facts.ts','magick-image-info.ts']:
  if (sdk/'src'/name).read_bytes()!=(PATCHES/'sdk'/name).read_bytes():fail('SDK source differs: '+name)
 if a.prepare_only:
  print(json.dumps({'status':'verified-sources-prepared','quantumDepth':8,'hdri':False}));return
 if not a.emsdk:fail('Pass --emsdk or set EMSDK to Emscripten4.0.15')
 emsdk=a.emsdk.resolve();tools=emsdk/'upstream/emscripten';jobs=str(max(1,a.jobs))
 env={**os.environ,'EM_CONFIG':str(emsdk/'.emscripten'),'PATH':str(tools)+os.pathsep+os.environ['PATH'],'EMCC_CORES':jobs,'BINARYEN_CORES':jobs,'CMAKE_BUILD_PARALLEL_LEVEL':jobs}
 if '4.0.15'not in subprocess.check_output([str(tools/'emcc'),'--version'],env=env,text=True):fail('Emscripten4.0.15 is required')
 flags=['-O3','-msimd128','-fexceptions','-fPIC','-DNDEBUG','-ffile-prefix-map='+str(root)+'/=q8-source-metadata/']
 env.update({'CC':str(tools/'emcc'),'CXX':str(tools/'em++'),'AR':str(tools/'emar'),'RANLIB':str(tools/'emranlib'),'CFLAGS':' '.join(flags),'CXXFLAGS':' '.join(flags),'CPPFLAGS':'-I'+str(deps/'include'),'LDFLAGS':'-L'+str(deps/'lib'),'LIBS':'-lc++','PKG_CONFIG_PATH':str(deps/'lib/pkgconfig'),'PKG_CONFIG_LIBDIR':str(deps/'lib/pkgconfig'),'EM_PKG_CONFIG_PATH':str(deps/'lib/pkgconfig')})
 def run(argv,cwd):subprocess.run([str(x)for x in argv],cwd=cwd,env=env,check=True)
 # Generate the public Native declarations from its pinned C sources, replacing
 # the authenticated upstream npm package with a local package of the same ABI.
 package=root/'native-package';generator=root/'type-generator';package.mkdir(exist_ok=True);generator.mkdir(exist_ok=True);(generator/'package.json').write_text('{"type":"module"}\n')
 for file in (native/'src/wasm-file-creator/src').glob('*.ts'):
  text=re.sub(r"from '(\./[^']+)'",r"from '\1.ts'",file.read_text()).replace("import { Method } from './code-parser.ts';","import type { Method } from './code-parser.ts';")
  (generator/file.name).write_text(text)
 run(['node','--experimental-transform-types',generator/'index.ts',native/'src/Magick.Native',package],root)
 manifest=json.loads((native/'publish/wasm/package.json').read_text());manifest['version']='2026.927.1314';(package/'package.json').write_text(json.dumps(manifest,indent=2)+'\n');(package/'magick.js').write_text('export {};\n');shutil.copyfile(native/'License.txt',package/'LICENSE')
 # The shipped product selects x86 only. Preserve its existing x64 JS export;
 # no x64 Wasm or claim of x64 metadata preservation is introduced here.
 baseline=(ENGINE/'vendor/media/magick/index.js').read_text();region=re.search(r'//#region [^\n]*/x64/magick\.js\n',baseline)
 if not region:fail('The paired SDK has no retained x64 factory region')
 start=region.end();end=baseline.index('//#endregion',start);factory=baseline[start:end];function=re.search(r'async function (\S+)\(',factory).group(1)
 (package/'x64/magick.js').write_text(factory+'\nexport default '+function+';\n')
 run(['npm','ci','--ignore-scripts','--registry=https://registry.npmjs.org'],sdk)
 build=root/'core-build';prefix=root/'prefix';nb=root/'native-build'
 for path in [build,prefix,nb]:path.mkdir(exist_ok=True)
 if not(build/'Makefile').exists():
  run([tools/'emconfigure',im/'configure','--host=wasm32-unknown-emscripten','--prefix='+str(prefix),'--disable-shared','--disable-opencl','--disable-dpc','--disable-assert','--disable-deprecated','--enable-static','--enable-delegate-build','--without-magick-plus-plus','--without-utilities','--disable-docs','--without-x','--without-perl','--without-python','--with-rsvg','--with-jxl','--with-quantum-depth=8','--enable-hdri=no','--disable-openmp','--without-threads','--without-lzma'],build)
 for file in (build/'MagickCore').glob('*.h'):
  old=file.read_text();new=old.replace(str(prefix),'/sherloq/q8-source-metadata')
  if file.name=='version.h':
   new=re.sub(r'#define MagickGitRevision  "[^"]*"','#define MagickGitRevision  "ad98b244c:20260927-source-metadata"',new);new=re.sub(r'#define MagickReleaseDate  "[^"]*"','#define MagickReleaseDate  "2026-09-27"',new)
  if old!=new:file.write_text(new)
 run(['make','-j'+jobs,'install'],build)
 for sourceFolder,targetFolder in [(im/'MagickCore',prefix/'include/ImageMagick-7/MagickCore'),(im/'coders',prefix/'include/ImageMagick-7/coders')]:
  targetFolder.mkdir(exist_ok=True)
  for file in sourceFolder.glob('*-private.h'):shutil.copyfile(file,targetFolder/file.name)
 # Keep the two Native assertion paths stable independently of the caller's
 # build folder. Core source paths retain their own canonical prefix above.
 nativeFlags=' '.join(flags[:-1]+['-ffile-prefix-map='+str(root)+'/=q8-source-metadata/full-native/'])
 run([tools/'emcmake','cmake',native/'src/Magick.Native','-DDEPENDENCIES_DIR='+str(deps),'-DIMAGEMAGICK_DIR='+str(prefix),'-DCMAKE_C_FLAGS='+nativeFlags,'-DCMAKE_CXX_FLAGS='+nativeFlags,'-DDEPTH=8','-DHDRI_ENABLE=0','-DOPENMP=0','-DQUANTUM_NAME=Q8','-DLIBRARY_NAME=magick','-DPLATFORM=WASM','-DARCHITECTURE=x86','-DCMAKE_BUILD_TYPE=Release'],nb)
 run(['cmake','--build','.', '--parallel',jobs],nb)
 paired=sdk/'node_modules/@dlemstra/magick-native/x86';factory=(nb/'magick.js').read_text()
 if factory.count('magick.wasm",import.meta.url')!=1:fail('Native factory shape changed')
 (paired/'magick.js').write_text(factory.replace('magick.wasm",import.meta.url','data:text/plain;base64,"'));shutil.copyfile(nb/'magick.wasm',paired/'magick.wasm')
 run(['npm','run','build'],sdk)
 output=root/'output';output.mkdir(exist_ok=True)
 for source,name in [(sdk/'dist/index.js','index.js'),(sdk/'dist/index.d.ts','index.d.ts'),(nb/'magick.wasm','magick.wasm')]:shutil.copyfile(source,output/name)
 for file in output.iterdir():
  if file.is_file()and str(root).encode()in file.read_bytes():fail('Build prefix survived in '+file.name)
 (output/'BUILD.json').write_text(json.dumps({'schema':'sherloq.magick-q8-metadata-build/1','quantumDepth':8,'hdri':False,'toolchain':'Emscripten4.0.15','archives':pins,'files':{p.name:{'bytes':p.stat().st_size,'sha256':digest(p)}for p in output.iterdir()if p.is_file()}},indent=2)+'\n')
 print(json.dumps({'status':'complete-paired-q8-resource','output':str(output)}))

if __name__=='__main__':rebuild(arguments())
