"""Native automatic export including actual count/deduplication implementation."""
from pathlib import Path
import sys,json,hashlib,tempfile,numpy as np
root=Path(__file__).resolve().parents[1];sys.path.insert(0,str(root.parent/'source'))
from gui.sherloq_app.core.automatic_clones import export,SOURCES
ref=json.loads((root/'tests/data/composition-native.json').read_text());entries=ref['entries']
for e in entries:
 if 'pixel_mask' in e:e['pixel_mask']=np.asarray(e['pixel_mask'],np.uint8)
entries[-1]['cells']=np.asarray([[0,1],[0,2],[1,2]],np.int32);entries[-1]['block']=8
pair=dict(entries[0],id='duplicate',source='PatchMatch SIFT');entries.insert(-1,pair)
h,w=ref['height'],ref['width']
snapshot=dict(version=1,method='complete_automatic_analysis',configuration=dict(regions=ref['regions']),results={'D2PRL':{'raw':np.arange(23,dtype=np.float32)/8}},states={'D2PRL':'done'},errors={},biomes=entries,display=dict(maximum_length_px=float('inf')),corroboration=dict(entries=[e for e in entries if e['source'] in SOURCES],excluded=ref['excluded'],sources=list(SOURCES),metric='integer_method_search_context_count_not_probability',presentation='overlay',opacity=.7),image_shape=[h,w,3],decoded_bgr8_sha256='fixture')
with tempfile.TemporaryDirectory(dir=root/'.build') as folder:
 target=Path(folder)/'native.npz';export((str(target),snapshot))
 with np.load(target,allow_pickle=False) as archive:
  records={k:dict(dtype=archive[k].dtype.str,shape=list(archive[k].shape),sha256=hashlib.sha256(archive[k].tobytes()).hexdigest()) for k in archive.files if k!='metadata_json'}
  metadata=json.dumps(json.loads(str(archive['metadata_json'])),ensure_ascii=False,separators=(',',':'))
(root/'tests/data/automatic-export-native.json').write_text(json.dumps(dict(arrays=records,metadataText=metadata),ensure_ascii=False,indent=2)+'\n')
print(len(records),'native arrays with method/context counts and unique envelopes')
