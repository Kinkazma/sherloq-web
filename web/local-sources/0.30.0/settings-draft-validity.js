// Autosave borrows only the directly serialized automatic/composite/energy
// controls. Invalid drafts keep their DOM value and the last stored settings;
// explicit settings and calculation validators retain their existing contract.
const directlySerializedControls=[
 'automatic-scope','automatic-source','automatic-view','automatic-relation',
 'automatic-branch','automatic-d2-minimum','automatic-opacity',
 'composite-quality','composite-stage','composite-view',
 'energy-quality','energy-block','energy-minimum','energy-view','energy-opacity'
];
export function canPersistSettingsDraft(control){
 const nodes=directlySerializedControls.map(control);
 // An incomplete panel is a programming error for the existing serializer.
 // Do not hide it behind another invalid field's autosave deferral.
 if(nodes.some(node=>!node))return true;
 return nodes.every(node=>node.validity.valid&&
  (!['number','range'].includes(node.type)||node.value!==''&&Number.isFinite(Number(node.value)))&&
  (node.tagName!=='SELECT'||node.selectedIndex>=0));
}
