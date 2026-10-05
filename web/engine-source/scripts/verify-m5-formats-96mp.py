from pathlib import Path
import hashlib,json,time,cv2 as cv
root=Path(__file__).resolve().parents[1];started=time.perf_counter();proof=json.loads((root/'docs/m5-formats-96mp-proof.json').read_text());reference=json.loads((root/'docs/m5-formats-96mp-native-reference.json').read_text());assert proof['passed'];cases=[]
for index,(item,expected) in enumerate(zip(proof['cases'],reference['cases'],strict=True)):
    path=root/f'.build/integration/m5-formats-96mp-{index}.png';assert item['source']['sha256']==expected['sha256'] and path.stat().st_size==item['archive']['byteLength']
    with path.open('rb') as stream:digest=hashlib.file_digest(stream,'sha256').hexdigest()
    assert digest==item['archive']['sha256'];image=cv.imread(str(path));assert list(image.shape)==[expected['height'],expected['width'],3]
    rgb=cv.cvtColor(image,cv.COLOR_BGR2RGB);rgb_sha=hashlib.sha256(memoryview(rgb)).hexdigest();assert rgb_sha==expected['rgbSha256'];del image,rgb
    cases.append(dict(file=expected['file'],bytes=path.stat().st_size,sha256=digest,rgbSha256=rgb_sha))
report=dict(passed=True,scope='Every decoded pixel of both delivered full96MP PNGs compared with native after source unload.',engineCommit=proof['engineCommit'],cases=cases,seconds=time.perf_counter()-started)
(root/'docs/m5-formats-96mp-export-proof.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps(report))
