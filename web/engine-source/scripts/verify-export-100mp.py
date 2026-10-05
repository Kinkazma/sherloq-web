"""Independent, complete export verification (Pillow/NumPy/stdlib ZIP + CRC).
Only generated fixtures are accepted. No original image or detector is used.
"""
import argparse, ast, hashlib, json, re, struct, time, zipfile, zlib
from pathlib import Path
import numpy as np
from PIL import Image

parser=argparse.ArgumentParser();parser.add_argument('directory',type=Path);args=parser.parse_args();root=args.directory
proof=json.loads((root/'browser-proof.json').read_text());assert proof['synthetic'] is True and proof['dimensions']==[10000,10000]
started=time.monotonic();results=[];n=100000000

def file_hash(path):
 h=hashlib.sha256()
 with path.open('rb') as stream:
  for block in iter(lambda:stream.read(4*1024**2),b''):h.update(block)
 return h.hexdigest()

def verify_png(path,entry):
 with path.open('rb') as f:
  assert f.read(8)==b'\x89PNG\r\n\x1a\n';ended=False;chunks=0
  while not ended:
   size,kind=struct.unpack('>I4s',f.read(8));assert size<=65536
   data=f.read(size);assert len(data)==size and struct.unpack('>I',f.read(4))[0]==zlib.crc32(kind+data);chunks+=1
   assert kind in [b'IHDR',b'IDAT',b'IEND']
   ended=kind==b'IEND'
  assert not f.read(1)
 Image.MAX_IMAGE_PIXELS=None  # This explicitly generated 100 MP fixture is checked below.
 with Image.open(path) as img:
  assert img.size==(10000,10000) and img.mode=='RGB';decoded=hashlib.sha256()
  for y in range(0,10000,32):
   rows=min(32,10000-y);data=np.asarray(img.crop((0,y,10000,y+rows))).reshape(-1)
   index=np.arange(y*10000*3,(y+rows)*10000*3,dtype=np.uint64)
   expected=((index*17+(index>>9))&255).astype(np.uint8)
   assert np.array_equal(data,expected),f'PNG RGB mismatch at row {y}'
   decoded.update(data)
  assert decoded.hexdigest()==entry['sourceRgbSha256']
 return {'format':'png','dimensions':[10000,10000],'verifiedPixels':n,'rgbSha256':decoded.hexdigest(),'chunksVerified':chunks}

small={
 'root_results_patchmatch_points':np.array([0,0,1,0,1,0,0,1,1,1,0,1,0,0],dtype='<f4').reshape(2,7),
 'root_results_patchmatch_pairs':np.array([0,1,.1,2],dtype='<f8').reshape(1,4),
 'root_results_patchmatch_groups_0':np.array([0],dtype='<i8'),
 'root_results_patchmatch_colors':np.array([20,40,60],dtype='u1').reshape(1,3),
 'root_results_patchmatch_pair_search_regions':np.array([0],dtype='<i4'),
 'root_results_patchmatch_pair_algorithms':np.array([0],dtype='u1'),
 'root_results_sift_points':np.arange(1,8,dtype='<f8').reshape(1,7),
}

def expected_block(key,start,length):
 i=np.arange(start,start+length,dtype=np.int64)
 field=re.fullmatch(r'root_results_patchmatch_dense_maps_(\d+)_(.+)',key)
 if field:
  shift=int(field[1]);kind=field[2]
  if kind=='targets':return ((i+17+shift)%n).astype('<i4')
  if kind=='distances_squared':return ((i%4096+shift)/16).astype('<f4')
  if kind=='coherence_error':return ((i%257-128+shift)/8).astype('<f4')
  if kind=='consistent_mask':return (i%5==shift%5)
 allowed=re.fullmatch(r'root_results_patchmatch_browser_details_dense_fields_(\d+)_allowed',key)
 if allowed:return (i%7!=int(allowed[1])%7).astype('u1')
 if key=='root_results_d2prl_probability':return ((i%1024)/1024).astype('<f4')
 if key=='root_results_ela_energy':return ((i%4096)/16).astype('<f4')
 if key=='root_corroboration_counts':return np.zeros(length,dtype='u1')
 if key=='root_corroboration_context_counts':return np.zeros(length,dtype='<u4')
 raise AssertionError('Unexpected scientific array '+key)

def verify_npz(path):
 arrays={};texts={}
 with zipfile.ZipFile(path) as archive:
  assert len(archive.namelist())==len(set(archive.namelist()))
  for entry in archive.infolist():
   assert entry.filename.endswith('.npy') and entry.compress_type==zipfile.ZIP_STORED
   key=entry.filename[:-4]
   with archive.open(entry) as f:
    assert f.read(8)==b'\x93NUMPY\x01\x00';size=struct.unpack('<H',f.read(2))[0];header=ast.literal_eval(f.read(size).decode('ascii'))
    dtype=np.dtype(header['descr']);shape=header['shape'];assert header['fortran_order'] is False and not dtype.hasobject
    count=int(np.prod(shape)) if shape else 1;assert entry.file_size==10+size+count*dtype.itemsize
    if dtype.kind=='U':
     assert count==1 and entry.file_size<4*1024**2;texts[key]=str(np.frombuffer(f.read(),dtype=dtype)[0]);continue
    digest=hashlib.sha256();at=0
    while at<count:
     length=min(262144,count-at);raw=f.read(length*dtype.itemsize);assert len(raw)==length*dtype.itemsize;values=np.frombuffer(raw,dtype=dtype);digest.update(raw)
     expected=small[key].reshape(-1)[at:at+length] if key in small else expected_block(key,at,length)
     assert dtype==expected.dtype,(key,dtype,expected.dtype)
     assert np.array_equal(values,expected),(key,at)
     at+=length
    assert not f.read(1)  # ZipExtFile checks the complete member CRC at EOF.
    assert shape==(small[key].shape if key in small else (10000,10000)),(key,shape)
    arrays[key]={'shape':shape,'dtype':header['descr'],'verifiedValues':count,'sha256':digest.hexdigest()}
    print('Verified',key,count,flush=True)
  assert len(arrays)==26 and len(texts)==2,(len(arrays),len(texts))
  metadata=json.loads(texts['metadata_json']);assert metadata['synthetic'] is True
  admission=metadata['results']['patchmatch']['browser_details']['metrics']['residentAdmission']
  assert admission['fits'] is False and 'peakBytes' not in admission
  assert archive.infolist()[-1].header_offset>2**32
 return {'format':'npz','zip64':True,'arrays':arrays,'metadataAndCrcVerified':True,'optionalUndefinedMetricHandled':True}

for entry in proof['exports']:
 name='synthetic-100mp.npz' if entry['format']=='npz' else 'synthetic-100mp-'+str(entry['provenance']['compression'])+'.png'
 path=root/name;assert path.stat().st_size==entry['byteLength'];sha=file_hash(path);assert sha==entry['sha256']
 result=verify_npz(path) if entry['format']=='npz' else verify_png(path,entry)
 results.append({'file':name,'byteLength':path.stat().st_size,'sha256':sha,**result});print('PASSED',name,flush=True)
report={'passed':True,'synthetic':True,'verification':'Complete independent pixel/value comparison, ZIP/PNG CRC and whole-file SHA256; no detector execution','wallSeconds':time.monotonic()-started,'files':results}
(root/'verified-proof.json').write_text(json.dumps(report,indent=2)+'\n');print('ALL_EXPORTS_VERIFIED',flush=True)
