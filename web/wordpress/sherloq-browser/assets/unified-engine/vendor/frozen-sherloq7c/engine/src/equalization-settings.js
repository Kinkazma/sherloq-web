import "../../../../../runtime-context.js?v=0.31.0";
// Shared scientific controls. Parameter memory belongs to its caller, never global storage.
export const equalizationMethods=Object.freeze([
 {
  "id": "histogram",
  "name": "Histogramme",
  "algorithm": "HE",
  "preferred": true,
  "parameter": "Intensité",
  "unit": "%",
  "min": 0,
  "max": 100,
  "step": 1,
  "default": 100,
  "kind": "blend",
  "reference": "AHE"
 },
 {
  "id": "clahe",
  "name": "CLAHE",
  "algorithm": "CLAHE",
  "preferred": true,
  "parameter": "Limite de contraste",
  "unit": "",
  "min": 0.5,
  "max": 40,
  "step": 0.5,
  "default": 5,
  "kind": "clip",
  "reference": "CLAHE"
 },
 {
  "id": "ahe",
  "name": "AHE",
  "algorithm": "AHE",
  "preferred": true,
  "parameter": "Tuiles par axe",
  "unit": "",
  "min": 2,
  "max": 16,
  "step": 1,
  "default": 8,
  "kind": "tiles",
  "reference": "AHE"
 },
 {
  "id": "bbhe",
  "name": "BBHE",
  "algorithm": "BBHE",
  "parameter": "Intensité",
  "unit": "%",
  "min": 0,
  "max": 100,
  "step": 1,
  "default": 100,
  "kind": "blend",
  "reference": "BBHE"
 },
 {
  "id": "dsihe",
  "name": "DSIHE",
  "algorithm": "DSIHE",
  "parameter": "Intensité",
  "unit": "%",
  "min": 0,
  "max": 100,
  "step": 1,
  "default": 100,
  "kind": "blend",
  "reference": "DSIHE"
 },
 {
  "id": "mmbebhe",
  "name": "MMBEBHE",
  "algorithm": "MMBEBHE",
  "parameter": "Intensité",
  "unit": "%",
  "min": 0,
  "max": 100,
  "step": 1,
  "default": 100,
  "kind": "blend",
  "reference": "MMBEBHE"
 },
 {
  "id": "rmshe",
  "name": "RMSHE",
  "algorithm": "RMSHE",
  "parameter": "Profondeur",
  "unit": "",
  "min": 1,
  "max": 6,
  "step": 1,
  "default": 2,
  "kind": "depth",
  "reference": "RMSHE"
 },
 {
  "id": "rsihe",
  "name": "RSIHE",
  "algorithm": "RSIHE",
  "parameter": "Profondeur",
  "unit": "",
  "min": 1,
  "max": 6,
  "step": 1,
  "default": 2,
  "kind": "depth",
  "reference": "RSIHE"
 },
 {
  "id": "rswhe-m",
  "name": "RSWHE-M",
  "algorithm": "RSWHE-M",
  "parameter": "Profondeur",
  "unit": "",
  "min": 1,
  "max": 6,
  "step": 1,
  "default": 2,
  "kind": "depth",
  "reference": "RSWHE"
 },
 {
  "id": "rswhe-d",
  "name": "RSWHE-D",
  "algorithm": "RSWHE-D",
  "parameter": "Profondeur",
  "unit": "",
  "min": 1,
  "max": 6,
  "step": 1,
  "default": 2,
  "kind": "depth",
  "reference": "RSWHE"
 },
 {
  "id": "dhe",
  "name": "DHE",
  "algorithm": "DHE",
  "parameter": "Poids des effectifs",
  "unit": "",
  "min": 0,
  "max": 5,
  "step": 0.1,
  "default": 0,
  "kind": "x",
  "reference": "DHE"
 },
 {
  "id": "bpdhe",
  "name": "BPDHE",
  "algorithm": "BPDHE",
  "parameter": "Lissage de l’histogramme · σ",
  "unit": "",
  "min": 0.25,
  "max": 3,
  "step": 0.0001,
  "default": 1.0762,
  "kind": "sigma",
  "reference": "BPDHE"
 },
 {
  "id": "wthe",
  "name": "WTHE",
  "algorithm": "WTHE",
  "parameter": "Exposant de pondération",
  "unit": "",
  "min": 0.1,
  "max": 1,
  "step": 0.05,
  "default": 0.5,
  "kind": "r",
  "reference": "WTHE"
 },
 {
  "id": "esihe",
  "name": "ESIHE",
  "algorithm": "ESIHE",
  "parameter": "Facteur d’écrêtage",
  "unit": "×",
  "min": 0.25,
  "max": 4,
  "step": 0.05,
  "default": 1,
  "kind": "clip-factor",
  "reference": "ESIHE"
 },
 {
  "id": "cvc",
  "name": "CVC",
  "algorithm": "CVC",
  "parameter": "Voisinage",
  "unit": "px",
  "min": 3,
  "max": 15,
  "step": 2,
  "default": 7,
  "kind": "window",
  "reference": "CVC"
 },
 {
  "id": "agcwd",
  "name": "AGCWD",
  "algorithm": "AGCWD",
  "parameter": "Pondération · α",
  "unit": "",
  "min": 0.1,
  "max": 1,
  "step": 0.05,
  "default": 0.5,
  "kind": "alpha",
  "reference": "AGCWD"
 }
,
 {id:'sherloq7c',name:'Sherloq 7C',algorithm:'SHERLOQ7C',preferred:true,parameter:'Révélation',unit:'%',min:0,max:100,step:.1,default:0,kind:'sherloq7c',continuous:true}
].map(Object.freeze));
export const equalizationOperations=Object.freeze({'inspection.adjust':'equalize','detail.echo':null,'detail.gradient':'equalize','colors.pca':'equalize','comparison.image':'equalized','inspection.magnifier':'mode','noise.separation':'levels','ela.classic':null});
export function equalizationState(input,legacy=0,operation='inspection.adjust'){
 const values=equalizationMethods.map(m=>m.default);
 let method='none';
 if(operation==='inspection.adjust'&&legacy){method=legacy===1?'histogram':'clahe';if(legacy>=2)values[1]=[2,5,10,20][legacy-2];}
 else if(operation==='inspection.magnifier'&&legacy==='equalize'||operation==='noise.separation'&&legacy===0||['detail.gradient','colors.pca','comparison.image'].includes(operation)&&legacy===true)method='histogram';
 if(input!==undefined){
  if(!input||typeof input!=='object'||Array.isArray(input)||!['none',...equalizationMethods.map(m=>m.id)].includes(input.method)||!Array.isArray(input.values)||![16,values.length].includes(input.values.length))throw new TypeError('Invalid equalization settings');
  method=input.method;
  equalizationMethods.forEach((m,i)=>{const v=i===16&&input.values.length===16?m.default:input.values[i];if(typeof v!=='number'||!Number.isFinite(v)||v<m.min||v>m.max||!m.continuous&&Math.abs((v-m.min)/m.step-Math.round((v-m.min)/m.step))>1e-6)throw new TypeError('Invalid equalization parameter: '+m.id);values[i]=v;});
 }
 const sherloq7c={micro:0,precision:'1e-2',backend:'cpu',...(input?.sherloq7c??{})};
 if(input?.sherloq7c!==undefined&&(!input.sherloq7c||typeof input.sherloq7c!=='object'||Array.isArray(input.sherloq7c)))throw new TypeError('Invalid Sherloq equalization parameters');
 if(Object.keys(sherloq7c).some(k=>!['micro','precision','backend'].includes(k))||!Number.isFinite(sherloq7c.micro)||sherloq7c.micro<0||sherloq7c.micro>100||!['reference','1e-7','1e-4','1e-2'].includes(sherloq7c.precision)||!['auto','cpu','webgpu'].includes(sherloq7c.backend))throw new TypeError('Invalid Sherloq equalization parameters');
 return {method,values,sherloq7c};
}
export function equalizationPlan(operation,params){
 if(!Object.hasOwn(params??{},'equalization'))return null;
 if(!Object.hasOwn(equalizationOperations,operation))throw new TypeError('Equalization is unavailable for this operation');
 const state=equalizationState(params.equalization),base={...params};delete base.equalization;
 const method=equalizationMethods.find(m=>m.id===state.method),value=method?state.values[equalizationMethods.indexOf(method)]:0;
 const native=state.method==='histogram'&&value===100;
 let post=!!method,finish=null,channels=['detail.echo','detail.gradient','colors.pca','comparison.image','noise.separation','inspection.magnifier'].includes(operation);
 if(operation==='inspection.adjust'){
  const level=state.method==='clahe'?[2,5,10,20].indexOf(value):-1;
  if(native||level>=0){base.equalize=native?1:level+2;post=false;}
  else {base.equalize=0;if(post){finish={threshold:base.threshold,invert:base.invert};base.threshold=255;base.invert=false;}}
 }else if(operation==='detail.gradient'){
  // The explicit menu composes the requested native gradient (including its
  // intensity) before equalization. The legacy boolean path has no plan.
  delete base.toneBeforeEqualize;
  base.equalize=native;post=!!method&&!native;
  if(native)base.toneBeforeEqualize=true;
 }else if(['colors.pca','comparison.image'].includes(operation)){
  const key=equalizationOperations[operation];base[key]=native;post=!!method&&!native;
 }else if(operation==='noise.separation'){
  if(base.denoised)post=false;
  if(method)base.levels=native?0:255;else if(base.levels===0)base.levels=255;
  if(native)post=false;
 }else if(operation==='inspection.magnifier'){
  if(!method){base.mode='contrast';post=false;}
  else if(native){post=false;base.mode='equalize';}
  else {base.mode='identity';base.percent=0;base.channel=true;}
 }
 return {state,method,value,base,post,finish,channels};
}
