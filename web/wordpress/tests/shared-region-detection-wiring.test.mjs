import test from 'node:test';
import assert from 'node:assert/strict';
import {parseHTML} from 'linkedom';
import {createOriginalSourceRegionsController} from '../sherloq-browser/assets/original-source-regions-controller.js';
import {createIndividualRegionController} from '../sherloq-browser/assets/individual-region-controller.js';
import {createIndividualScientificScope} from '../sherloq-browser/assets/individual-scientific-scope.js';
const sha='e'.repeat(64);
function fixture(kind,{operation='ai.clones.d2prl'}={}){
 const {document}=parseHTML('<body><div id="parent"></div></body>'),parent=document.getElementById('parent');let image={blob:new Blob(['native-source']),id:'image-1',sourceSha256:sha,width:64,height:48};const edits=[],providers=[];
 const automatic=async()=>{},simple=async()=>{};
 const options={document,parent,source:()=>image,getClient:async()=>{throw Error('Opening the editor must not start an inference.');},scopeEditorFactory:opts=>{edits.push(opts);return{open:async()=>{},dispose:async()=>{}};},detectionActionsFactory:opts=>{providers.push(opts);return{onDetectAutomatically:automatic,onDetectSubimages:simple};}};
 const owner=kind==='original'?createOriginalSourceRegionsController(options):createIndividualRegionController({...options,operation:()=>operation,canEditScope:()=>true,panelMode:'editor-only'});if(kind!=='original')owner.sourceChanged();
 return{owner,edits,providers,automatic,simple,parent,get image(){return image;},replace:()=>{image={...image,id:'image-2',blob:new Blob(['replacement'])};}};
}
for(const kind of ['original','individual'])test(kind+' shared editor receives both live providers with source ownership guards',async()=>{
 const f=fixture(kind);try{await f.owner.ready;await f.owner.edit();const edit=f.edits.at(-1),provider=f.providers.at(-1);assert.equal(edit.onDetectAutomatically,f.automatic);assert.equal(edit.onDetectSubimages,f.simple);assert.equal(provider.isCurrent(),true);assert.equal(provider.excludeTexts(),true);assert.equal(edit.image.blob,f.image.blob);f.replace();assert.equal(provider.isCurrent(),false);}finally{await f.owner.dispose();}
});
test('a generic pixel tool edits its own scope without implicitly enabling automatic OCR or clone parameters',async()=>{
 const f=fixture('individual',{operation:'colors.pca'});try{assert.equal(f.owner.active(),true);assert.equal(f.owner.scientificActive(),false);await f.owner.edit();const edit=f.edits.at(-1),provider=f.providers.at(-1),proposal=await createIndividualScientificScope(f.image,{rectangles:[{x0:5,y0:5,x1:25,y1:35},{x0:35,y0:5,x1:55,y1:35}],excludeTexts:false});await edit.onSave(proposal);assert.equal(f.owner.scope.fingerprint,proposal.fingerprint);assert.equal(provider.isCurrent(),false,'A proposal closes the old source/scope transaction.');const ready=await f.owner.prepareForCalculation();assert.equal(ready.fingerprint,proposal.fingerprint);const task={operation:'colors.pca',params:{component:2}};assert.equal(f.owner.task(task),task,'Generic scope is bound by the shared source domain, not clone-specific params.');assert.equal(f.parent.querySelector('.detection-text-option').hidden,true);assert.equal(f.parent.querySelector('.detection-regions-panel'),null);await assert.rejects(async()=>edit.onSave(proposal),{code:'CANCELLED'});}finally{await f.owner.dispose();}
});
