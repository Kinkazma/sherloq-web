"""Qualify one explicit native resource refusal without generalizing its scope."""
from pathlib import Path
import hashlib,json,sys,time
import cv2 as cv
import numpy as np
root=Path(__file__).resolve().parents[1];sys.path.insert(0,str(root.parent/'source'))
from gui.sherloq_app.core.cloning import CloningEngine
from gui.sherloq_app.core.jpeg_curve import Cancelled
assert cv.__version__=='4.11.0' and np.__version__=='1.26.4'
file=root/'.build/akaze-pipeline-study/large-checker.png'
engine=CloningEngine(cv.imread(str(file)));started=time.monotonic()
params=(2,90,20,15,5,False,False)
try:
    engine.analyze(params,cancel=lambda:time.monotonic()-started>120)
    raise AssertionError('Expected the native match budget to refuse this case')
except ValueError as error:
    assert str(error).startswith('Matching exceeds the 256 MiB result budget.'),str(error)
    detected=engine.detected.get((2,0));selected=engine.selected.get((2,0,90))
    proof=dict(schema=1,status='native-match-budget-refusal',originalSha256=hashlib.sha256(file.read_bytes()).hexdigest(),nativeSourceSha256=hashlib.sha256((root.parent/'source/gui/sherloq_app/core/cloning.py').read_bytes()).hexdigest(),numpy=np.__version__,opencv=cv.__version__,params=dict(response=90,matching=20,distance=15,minimum=5,showPoints=False,hideLines=False),total=len(detected[0]),filtered=len(selected[0]),error=str(error),scope='Only the default all-image configuration. Other dense parameter settings and a complete successful dense pipeline remain unqualified.')
    (root/'docs/akaze-stress-native-proof.json').write_text(json.dumps(proof,indent=2)+'\n');print(json.dumps(proof))
except Cancelled:
    raise SystemExit('Native development watchdog: no refusal qualification acquired')
