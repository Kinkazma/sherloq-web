export const PDF_DOMAIN_DETECTOR='native-geometric-panels-v2-fine-gutters';
export function obsoletePDFScope(scope){
 const detector=scope?.provenance?.detector;
 return typeof detector==='string'&&detector.startsWith('native-geometric-panels-')&&detector!==PDF_DOMAIN_DETECTOR;
}
