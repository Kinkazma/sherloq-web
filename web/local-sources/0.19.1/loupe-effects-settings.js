// Presentation effects use the existing engine operators on bounded local views.
const adjust={brightness:0,saturation:0,hue:0,gamma:10,shadows:0,highlights:0,sweep:127,width:255,sharpen:0,threshold:255,equalize:0,invert:false};
export const effectDefaults=Object.freeze({adjust:Object.freeze({enabled:false,...adjust}),enhance:Object.freeze({enabled:false,mode:'contrast',percent:20,channel:false}),sweep:Object.freeze({enabled:false,position:127,width:32,opacity:100})});
export const effectRanges={adjust:{brightness:[-255,255],saturation:[-255,255],hue:[0,180],gamma:[1,50],shadows:[-100,100],highlights:[-100,100],sweep:[0,255],width:[0,255],sharpen:[0,100],threshold:[0,255],equalize:[0,5]},enhance:{percent:[0,100]},sweep:{position:[0,255],width:[1,255],opacity:[0,100]}};
export const adjustmentParameters=value=>Object.fromEntries(Object.keys(adjust).map(k=>[k,value[k]]));
export function validateLoupeEffects(input={}){
 if(!input||typeof input!=='object'||Array.isArray(input))throw Error('Invalid loupe effects');const result={};
 const ranges=effectRanges;
 for(const [group,defaults]of Object.entries(effectDefaults)){
  if(input[group]!==undefined&&(!input[group]||typeof input[group]!=='object'||Array.isArray(input[group])))throw Error('Invalid loupe effect');
  const v={...defaults,...input[group]};for(const [key,initial]of Object.entries(defaults)){if(typeof initial==='boolean'&&typeof v[key]!=='boolean')throw Error('Invalid loupe effect toggle');const range=ranges[group][key];if(range&&(!Number.isFinite(v[key])||v[key]<range[0]||v[key]>range[1]||(!range[2]&&!Number.isInteger(v[key]))))throw Error('Invalid loupe effect parameter');}
  if(group==='enhance'&&!['equalize','contrast'].includes(v.mode))throw Error('Invalid loupe effect mode');result[group]=Object.fromEntries(Object.keys(defaults).map(k=>[k,v[k]]));
 }return result;
}
export const hasLoupeEffects=value=>Object.values(value??{}).some(v=>v.enabled);
export function sweepPixels(pixels,{position,width,opacity}){
 const data=new Uint8Array(pixels.data.length),lo=position-width/2,gain=255/width,weight=opacity/100;
 for(let i=0;i<data.length;i++){const before=pixels.data[i],after=Math.max(0,Math.min(255,(before-lo)*gain));data[i]=Math.round(before+(after-before)*weight);}return{...pixels,data};
}
