// Native automatic values are explicit: zero is not generally an automatic mode.
export function automaticParameterMode(operation,key){
 if(operation==='colors.plots'&&key==='scale'||operation==='detail.wavelets'&&key==='level')return{value:null,boundary:0};
 if(operation==='inspection.adjust'&&key==='threshold')return{value:0,boundary:1};
 if(['ela.energy','ela.biomes'].includes(operation)&&key==='quality')return{value:0,boundary:1};
 if(operation==='composite'&&key==='quality')return{value:0,boundary:51};
 return null;
}
const automaticInputValidation=new WeakMap();
export function configureAutomaticSlider(input,operation,key,context={}){
 const mode=automaticParameterMode(operation,key),constraint=mode?(sourceParameterConstraint(operation,key,context)??(operation==='colors.plots'?{min:0,max:30,step:1,nullable:true}:null)):null;
 if(constraint){for(const name of ['min','max','step'])input.setAttribute(name,String(constraint[name]));input.required=!constraint.nullable;}
 if(mode)input.setAttribute('data-hover-slider-automatic',JSON.stringify(mode));else input.removeAttribute('data-hover-slider-automatic');
 if(mode&&typeof mode.value==='number'&&mode.boundary-mode.value>Number(constraint?.step??1)&&!automaticInputValidation.has(input)){
  const validate=()=>{const value=input.value===''?NaN:Number(input.value),invalid=Number.isFinite(value)&&value!==mode.value&&value<mode.boundary,en=input.ownerDocument?.documentElement?.lang==='en';input.setCustomValidity?.(invalid?(en?'Minimum manual value: ':'Valeur manuelle minimale : ')+mode.boundary+' ('+mode.value+' = Auto)':'');};
  input.addEventListener?.('input',validate);input.addEventListener?.('change',validate);automaticInputValidation.set(input,validate);validate();
 }
 return mode;
}

// Constraints from the native source, not from the provisional display grid.
const dimension=value=>Number.isSafeInteger(value)&&value>0;
const byteCount=value=>Number.isSafeInteger(value)&&value>=0;

export function sourceParameterConstraint(operation,key,{width,height,byteLength,offset=0}={}){
 if(operation==='colors.plots'&&key==='scale'){
  if(!dimension(width)||!dimension(height))return null;
  return{min:0,max:Math.min(30,Math.floor(Math.log2(Math.min(width,height)))),step:1,nullable:true,automatic:automaticParameterMode(operation,key)};
 }
 if(operation==='composite'&&key==='quality')return{min:0,max:101,step:1,nullable:false,automatic:automaticParameterMode(operation,key)};
 if(['ela.energy','ela.biomes'].includes(operation)&&key==='quality')return{min:0,max:100,step:1,nullable:false,automatic:automaticParameterMode(operation,key)};
 if(operation==='inspection.adjust'&&key==='threshold')return{min:0,max:255,step:1,nullable:false,automatic:automaticParameterMode(operation,key)};
 if(operation==='file.hex'){
  if(key==='offset')return byteCount(byteLength)?{min:0,max:byteLength,step:1}:null;
  if(key==='length')return{min:1,max:65536,step:1,...(byteCount(byteLength)&&byteCount(offset)&&offset<=byteLength?{remainingBytes:byteLength-offset}:{})};
 }
 if(operation==='detail.wavelets'&&key==='level')return{min:0,max:30,step:1,nullable:true,automatic:automaticParameterMode(operation,key)};
 return null;
}

// Source changes can invalidate a formerly valid integer. Return the correction
// explicitly so the owner updates both its control and persisted parameters.
export function constrainSourceParameterValue(operation,key,value,context){
 const constraint=sourceParameterConstraint(operation,key,context);
 if(!constraint)return{value,changed:false,valid:true,constraint:null};
 if(value===null&&constraint.nullable)return{value,changed:false,valid:true,constraint};
 if(!Number.isSafeInteger(value))return{value,changed:false,valid:false,constraint};
 const next=Math.max(constraint.min,Math.min(constraint.max,value));
 return{value:next,changed:!Object.is(next,value),valid:true,constraint};
}

// The engine accepts EOF exactly. Page size remains the user's chosen native
// setting even when the final window contains fewer bytes.
export function hexPageNavigation({offset,length,totalBytes}){
 if(!byteCount(totalBytes)||!byteCount(offset)||offset>totalBytes||!Number.isSafeInteger(length)||length<1||length>65536)throw new TypeError('Invalid original-byte page.');
 const end=offset+Math.min(length,totalBytes-offset);
 return{offset,length,totalBytes,end,remainingBytes:totalBytes-offset,eof:offset===totalBytes,previousOffset:Math.max(0,offset-length),nextOffset:end,previousDisabled:offset===0,nextDisabled:end>=totalBytes};
}

// Arrow repeats stop at the numeric boundary. Entering Automatic is a separate,
// deliberate keyboard command; no negative scientific value is manufactured.
export function automaticBoundaryValue(value,key,{boundary=0,value:automatic=null,altKey=false,repeat=false}={}){
 if(key==='ArrowLeft'&&altKey&&!repeat&&(Object.is(value,boundary)||Object.is(value,automatic)))return{handled:true,value:automatic};
 if((key==='ArrowUp'||key==='ArrowRight'||key==='Home')&&Object.is(value,automatic))return{handled:true,value:boundary};
 if((key==='ArrowDown'||key==='ArrowLeft')&&Object.is(value,boundary))return{handled:true,value:boundary};
 return{handled:false,value};
}
