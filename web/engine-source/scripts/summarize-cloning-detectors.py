"""Publish arithmetic rejection evidence; no weights or private input images."""
from pathlib import Path
import json
root=Path(__file__).resolve().parents[1];base=root/'.build/cloning-study'
experiments=[]
for name,label in [('detector-results','stock portable OpenCV'),('detector-native-brisk-results','native-angle ORB plus BRISK explicit contractions')]:
    source=json.loads((base/(name+'.json')).read_text());algorithms=[]
    for algorithm,identifier in enumerate(['BRISK','ORB','AKAZE']):
        rows=[r for r in source['records'] if r['algorithm']==algorithm]
        algorithms.append(dict(algorithm=identifier,cases=len(rows),pointCountDifferences=sum(r.get('nativeCount')!=r.get('actualCount') for r in rows),pointFieldCases=sum(any(r.get('differences',[])) for r in rows),maximumPointFieldAbsoluteErrors=[max((r.get('errors',[0]*7)[i] for r in rows),default=0) for i in range(7)],descriptorCases=sum(bool(r.get('descriptorDifferences',0)) for r in rows),descriptorBytesDifferent=sum(r.get('descriptorDifferences',0) for r in rows)))
    experiments.append(dict(candidate=label,nativeSourceSha256=source['referenceSource'],algorithms=algorithms,records=source['records']))
report=dict(schema=1,status='BRISK and AKAZE parity rejected; separate corrected ORB qualification in cloning-study and product proofs',pointFields=['x','y','size','angle','response','octave','classId'],scope='Generated small public images only. Matching point counts do not establish descriptor or final-decision parity. No alternative detector selected implicitly.',experiments=experiments)
(root/'docs/cloning-detector-rejections.json').write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps([dict(candidate=x['candidate'],algorithms=x['algorithms']) for x in experiments]))
