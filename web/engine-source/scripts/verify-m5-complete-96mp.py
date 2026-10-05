"""Independently read every ZIP/NumPy field delivered by the common worker."""
from pathlib import Path
import hashlib,json,time,zipfile,argparse
import numpy as np
parser=argparse.ArgumentParser();parser.add_argument('--variant',choices=['96mp','small-positive','small-positive-cache'],default='96mp');parser.add_argument('--run-directory',type=Path);args=parser.parse_args();stem='m5-complete-'+args.variant
root=Path(__file__).resolve().parents[1]
if args.run_directory and args.variant!='96mp':parser.error('--run-directory requires the 96mp variant')
path=args.run_directory/'complete.npz' if args.run_directory else root/('.build/integration/'+stem+'.npz')
proof_path=args.run_directory/'result.json' if args.run_directory else root/('docs/'+stem+'-proof.json')
output=args.run_directory/'archive-verification.json' if args.run_directory else root/('docs/'+stem+'-archive-proof.json')
proof=json.loads(proof_path.read_text());start=time.perf_counter();records={};metadata=None
assert proof['passed'] and path.stat().st_size==proof['archive']['byteLength']
with zipfile.ZipFile(path) as archive:
    assert len(archive.namelist())==len(set(archive.namelist()))
    for item in archive.infolist():
        name=item.filename.removesuffix('.npy');expected=proof['archive']['arrays'][name]
        with archive.open(item) as source:
            version=np.lib.format.read_magic(source);assert version==(1,0)
            shape,fortran,dtype=np.lib.format.read_array_header_1_0(source);assert not fortran and not dtype.hasobject
            assert list(shape)==expected['shape'] and dtype.str==expected['dtype'],name
            count=int(np.prod(shape,dtype=np.int64)) if shape else 1;size=count*dtype.itemsize;assert size==expected['bytes']
            remaining=size;hash=hashlib.sha256();parts=[]
            while remaining:
                chunk=source.read(min(4*1024**2,remaining));assert chunk,'Truncated '+name;remaining-=len(chunk);hash.update(chunk)
                if name=='metadata_json':parts.append(chunk)
            assert not source.read(1);assert hash.hexdigest()==expected['sha256'],name
            if name=='metadata_json':metadata=json.loads(str(np.frombuffer(b''.join(parts),dtype=dtype)[0]))
            records[name]=dict(shape=list(shape),dtype=dtype.str,bytes=size,sha256=hash.hexdigest(),crc=item.CRC)
assert set(records)==set(proof['archive']['arrays'])
assert metadata['method']=='complete_automatic_analysis' and metadata['image_shape']==[proof['dimensions'][1],proof['dimensions'][0],3]
assert all(metadata['states'][g]=='done' for g in ['patchmatch','sift','forgeryscope','d2prl','ela'])
with path.open('rb') as source:digest=hashlib.file_digest(source,'sha256').hexdigest()
assert digest==proof['archive']['sha256']
report=dict(passed=True,scope='Independent zipfile CRC and NumPy headers plus every payload hash; this reuses detector arithmetic proofs and is not a new native96MP inference.',bytes=path.stat().st_size,sha256=digest,arrays=records,states=metadata['states'],seconds=time.perf_counter()-start,numpy=np.__version__)
if args.variant=='small-positive-cache':
    baseline=json.loads((root/'docs/m5-complete-small-positive-proof.json').read_text())
    prefix='root_results_patchmatch_'
    old={key:value for key,value in baseline['archive']['arrays'].items() if key.startswith(prefix)}
    current={key:value for key,value in records.items() if key.startswith(prefix)}
    assert set(old)==set(current)
    assert sum(key.startswith('root_results_patchmatch_dense_maps_') and key.endswith('_targets') for key in current)==11
    for key,value in current.items():
        assert all(value[field]==old[key][field] for field in ['shape','dtype','bytes','sha256']),key
    report['priorDenseComparison']={'baselineEngineCommit':baseline['engineCommit'],'candidateEngineCommit':proof['engineCommit'],'arrays':len(current),'extendedMaps':11,'allFullArraysExact':True,'scope':'Complete PatchMatch scientific arrays, geometry and detail planes against the independently verified positive-source baseline; not a new native inference oracle.'}
    scientific={key for key in records if key not in ['metadata_json','browser_provenance_json']}
    assert scientific==set(baseline['archive']['arrays'])-{'metadata_json','browser_provenance_json'}
    for key in scientific:
        assert all(records[key][field]==baseline['archive']['arrays'][key][field] for field in ['shape','dtype','bytes','sha256']),key
    report['priorScientificComparison']={'arrays':len(scientific),'allFullArraysExact':True,'excludedProvenanceArrays':['metadata_json','browser_provenance_json']}

output.write_text(json.dumps(report,indent=2)+'\n');print(json.dumps({k:v for k,v in report.items() if k!='arrays'}))
