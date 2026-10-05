"""Execute the actual native widget selection methods without a Qt event loop.

Only GUI controls are lightweight values; method bodies come directly from AST.
"""
from pathlib import Path
from types import SimpleNamespace as NS
import ast,sys,json,hashlib
root=Path(__file__).resolve().parents[1];native=root.parent/'source/gui/sherloq_app';sys.path.insert(0,str(root.parent/'source'))
from gui.sherloq_app.core.automatic_clones import SOURCES,CLASSICAL_SOURCES,visible
from gui.sherloq_app.core.complete_analysis import ELA_SOURCE
scope=dict(SOURCES=SOURCES,CLASSICAL_SOURCES=CLASSICAL_SOURCES,ELA_SOURCE=ELA_SOURCE)
files={}
for filename,classname,methods in [('automatic_clones.py','AutomaticClonesWidget',('display_entries','corroboration_active')),('complete_analysis.py','CompleteAnalysisWidget',('effective_ela_mode','display_entries'))]:
    source=(native/'tools/tampering'/filename).read_text();files[filename]=hashlib.sha256(source.encode()).hexdigest()
    tree=ast.parse(source);cls=next(n for n in tree.body if isinstance(n,ast.ClassDef) and n.name==classname)
    cls.body=[n for n in cls.body if isinstance(n,ast.FunctionDef) and n.name in methods]
    cls.bases=[] if classname=='AutomaticClonesWidget' else [ast.Name(id='AutomaticClonesWidget',ctx=ast.Load())]
    exec(compile(ast.fix_missing_locations(ast.Module(body=[cls],type_ignores=[])),filename,'exec'),scope)
entries=[dict(id='within',source=CLASSICAL_SOURCES[0],relation='within'),dict(id='between',source=CLASSICAL_SOURCES[1],relation='between'),*[dict(id=b,source=SOURCES[0],provenance=dict(branch=b)) for b in ('microscopy','blots','lanes')],dict(id='d2',source='D2PRL'),dict(id='cell',source=ELA_SOURCE),dict(id='low',source=ELA_SOURCE,kind='low'),dict(id='high',source=ELA_SOURCE,kind='high')]
base=dict(complete=True,tab='overlay',presentation='biomes',relation='all',enabledSources=[*SOURCES,ELA_SOURCE],hidden=[],focused=None,ela=dict(background=0,biomes=True),elaEnergy=True,elaLegacy=True,forgeryscopeBranch='')
updates=[dict(name='mode-'+str(i),ela=dict(background=i,biomes=True)) for i in range(5)]
updates += [dict(name='map-suppresses-ela',presentation='map',ela=dict(background=4,biomes=True)),dict(name='within',relation='within'),dict(name='between',relation='between'),dict(name='branch',forgeryscopeBranch='blots'),dict(name='energy-off',elaEnergy=False),dict(name='legacy-off',elaLegacy=False),dict(name='ela-disabled',enabledSources=list(SOURCES),ela=dict(background=2,biomes=True)),dict(name='d2-tab-ignores-ela-only',tab='D2PRL',ela=dict(background=2,biomes=True)),dict(name='ela-tab',tab=ELA_SOURCE,ela=dict(background=3,biomes=True)),dict(name='hidden',hidden=['d2','cell','low']),dict(name='focused',focused='blots'),dict(name='disabled-source',enabledSources=[ELA_SOURCE,'D2PRL'])]
cases=[]
for update in updates:
    name=update.pop('name');v={**base,**update};widget=scope['CompleteAnalysisWidget']();widget.biomes=entries
    widget.source=lambda:None if v['tab']=='overlay' else v['tab'];widget.enabled_sources=lambda:v['enabledSources']
    for key,value in [('forge_branch',v['forgeryscopeBranch']),('relations',v['relation']),('presentation',v['presentation'])]:setattr(widget,key,NS(currentData=lambda value=value:value))
    widget.ela_mode=NS(currentIndex=lambda:v['ela']['background']);widget.ela_energy_visible=NS(isChecked=lambda:v['elaEnergy']);widget.ela_legacy_visible=NS(isChecked=lambda:v['elaLegacy'])
    cases.append(dict(name=name,view=v,expected=[e['id'] for e in visible(widget.display_entries(),None,set(v['hidden']),v['focused'])],mode=widget.effective_ela_mode(),corroborating=widget.corroboration_active()))
(root/'tests/data/automatic-view-native.json').write_text(json.dumps(dict(native=files,entries=entries,cases=cases),indent=2)+'\n')
print(len(cases),'actual native widget selection cases')
