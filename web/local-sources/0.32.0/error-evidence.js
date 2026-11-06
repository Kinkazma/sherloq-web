// Text-only error structure shared by the tool report and session diagnostic.
// Never evaluate an error accessor outside a guard. Limit the whole cleanup
// tree before encoding, as well as its depth and each individual collection.
const unreadable=property=>({name:'DiagnosticReadError',code:'DIAGNOSTIC_PROPERTY_UNREADABLE',message:'Error property could not be read.',unreadable:true,property});
const field=(value,key)=>{try{return key in value?{present:true,value:value[key]}:{present:false};}catch{return{present:true,value:unreadable(key)};}};
export function errorEvidence(error,depth=0,seen=new WeakSet(),budget={remaining:128}){
 if(budget.remaining--<=0)return {message:'[node limit]'};
 if(error===null||typeof error!=='object'){
  const type=error===null?'null':typeof error;let message;try{message=String(error);}catch{message='[unprintable thrown value]';}
  const value=error===undefined?'undefined':Object.is(error,-0)?'-0':typeof error==='number'&&!Number.isFinite(error)?message:typeof error==='symbol'||typeof error==='function'?message:error;
  return {message,thrownType:type,thrownValue:value};
 }
 if(seen.has(error))return {message:'[circular]'};seen.add(error);
 const out={};for(const key of ['name','code','message','stack','details','unreadable','property']){const entry=field(error,key);if(entry.present)out[key]=entry.value;}
 const nested=value=>depth<8?errorEvidence(value,depth+1,seen,budget):{message:'[depth limit]'};
 for(const key of ['cleanupError','cause']){const entry=field(error,key);if(entry.present)out[key]=nested(entry.value);}
 const errors=field(error,'cleanupErrors');
 if(errors.present){
  const values=errors.value;
  if(Array.isArray(values)){
   const length=field(values,'length');
   if(!Number.isSafeInteger(length.value)||length.value<0)out.cleanupErrors=nested(unreadable('length'));
   else{const selected=[];for(let n=0;n<Math.min(128,length.value)&&budget.remaining>0;n++)selected.push(nested(field(values,String(n)).value));out.cleanupErrors=selected;if(length.value>selected.length)out.cleanupErrorsOmitted=length.value-selected.length;}
  }else out.cleanupErrors=nested(values);
 }
 return out;
}
