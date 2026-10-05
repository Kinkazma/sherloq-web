"""Small native parameter oracle; never executes or replaces a detector."""
import ast
import hashlib
import json
from pathlib import Path
import sys

root=Path(__file__).resolve().parents[1]
native=root.parent/'source/gui/sherloq_app'
sys.path.insert(0,str(root.parent/'source'))
from gui.sherloq_app.core.automatic_clones import parameters, SIFT_SOURCE
from gui.sherloq_app.core.auto_zones import enclosing

# Execute the actual widget methods against inert request-recording objects,
# without importing PySide or starting any computation.
widget=native/'tools/tampering/automatic_clones.py'
tree=ast.parse(widget.read_text())
methods=[m for c in tree.body if isinstance(c,ast.ClassDef) for m in c.body if isinstance(m,ast.FunctionDef) and m.name in ('auto_ready','start')]
assert len(methods)==2
class Stub:
    def __init__(self,**kwargs): self.__dict__.update(kwargs)
    def __getattr__(self,name): return lambda *args: None
class Job:
    def request(self,*args): self.args=args
namespace=dict(enclosing=enclosing,parameters=parameters,SIFT_SOURCE=SIFT_SOURCE,D2PRL_SOURCE='D2PRL',Event=lambda:None)
exec(compile(ast.Module(body=methods,type_ignores=[]),str(widget),'exec'),namespace)
def box(x,y,w,h): return ((x,y),(x+w-1,y),(x+w-1,y+h-1),(x,y+h-1))
a,b=box(10,20,30,40),box(120,70,51,29)
inputs=[dict(name='no-panels',width=311,height=239,detected=()),dict(name='panels',width=311,height=239,detected=(a,b)),dict(name='envelope-disabled',width=311,height=239,detected=(a,b),disabled=[2]),dict(name='one-panel-disabled',width=311,height=239,detected=(a,b),disabled=[0]),dict(name='all-disabled',width=311,height=239,detected=(a,b),disabled=[0,1,2]),dict(name='duplicates',width=311,height=239,detected=(a,a,b)),dict(name='single-envelope',width=311,height=239,detected=(a,),cpu=True),dict(name='vertex-order',width=311,height=239,detected=(a[::-1],)),dict(name='fractional',width=311,height=239,detected=(box(.125,.75,40.1,38.3),b)),dict(name='thin-image',width=1,height=170,detected=()),dict(name='decimal-round',width=311,height=239,detected=(((0,0),(2.675,0),(0,0)),))]
cases=[]
for data in inputs:
    current=dict(data);detected=current.pop('detected');off=current.get('disabled',[])
    view=Stub(set_regions=lambda r: setattr(view,'regions',r),snapshot=lambda:view.regions)
    fake=Stub(closed=False,image=Stub(shape=(data['height'],data['width'],3)),viewer=Stub(view=view),zone_model=Stub(disabled=set()),detect=Stub(),run=Stub(),sync_zones=lambda:None,start=lambda:None)
    namespace['auto_ready'](fake,detected)
    zones,envelope=view.regions,fake.envelope
    current.update(regions=zones,envelope=envelope,disabled=off)
    fake.zone_model.disabled=set(off);fake.cpu=Stub(isChecked=lambda:data.get('cpu',False));fake.states={'sift':'Running'};fake.job=Job();fake.forge=Job();fake.d2_job=Job();fake.sift_job=Job();fake.clear_results=lambda:None
    p,active,forge=parameters(fake.image.shape,zones,envelope,off,data.get('cpu',False))
    namespace['start'](fake)
    s=list(p);s[0]=SIFT_SOURCE;s[3]=10.;s[4]=.725;s[6:9]=['Affine',5.,10];s[11]=True;s[15]=False
    d2=dict(forge,variant='D2PRL',regions=tuple(dict.fromkeys(active)))
    if active:
        assert fake.job.args[0][:3]==(p,active,False)
        assert fake.sift_job.args[0][:3]==(tuple(s),active,False)
        assert fake.d2_job.args[0]==d2
    cases.append(dict(input=current,detected=detected,selection=dict(regions=zones,envelope=envelope,disabled=[]),active=active,native=dict(patchmatch=p,sift=s,forgeryscope=forge,d2prl=d2)))
files=['core/automatic_clones.py','core/auto_zones.py','tools/tampering/automatic_clones.py']
output=dict(native={name:hashlib.sha256((native/name).read_bytes()).hexdigest() for name in files},cases=cases)
(root/'tests/data/automatic-plan-native.json').write_text(json.dumps(output,indent=2)+'\n')
print(len(cases),'native selections and submissions')
