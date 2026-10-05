// Static adapters for the pinned icodec 0.6.0 Embind ABI. No eval/Function.
// Native codec bytes are unchanged. See scripts/patch-public-heic.py.
function craftInvokerFunction(humanName,argTypes,classType,cppInvokerFunc,cppTargetFunc,isAsync){
 if(argTypes.length<2||isAsync)throwBindingError('Unsupported HEIC binding signature');
 const method=argTypes[1]!==null&&classType!==null,stack=usesDestructorStack(argTypes),returns=argTypes[0].name!=='void';
 return createNamedFunction(humanName,function(...args){
  const destructors=[],wired=[],call=[cppTargetFunc];let self;
  try{
   if(method){self=argTypes[1].toWireType(destructors,this);call.push(self);}
   for(let i=2;i<argTypes.length;i++){const value=argTypes[i].toWireType(destructors,args[i-2]);wired.push(value);call.push(value);}
   const value=cppInvokerFunc(...call);return returns?argTypes[0].fromWireType(value):undefined;
  }finally{
   if(stack)runDestructors(destructors);
   else{if(method&&self!==undefined&&argTypes[1].destructorFunction!==null)argTypes[1].destructorFunction(self);
    for(let i=0;i<wired.length;i++)if(argTypes[i+2].destructorFunction!==null)argTypes[i+2].destructorFunction(wired[i]);}
  }
 });
}
// EMVAL_ADAPTER
var __emval_get_method_caller=(argCount,argTypes,kind)=>{
 const types=emval_lookupTypes(argCount,argTypes),retType=types.shift();
 if(kind!==0&&kind!==1)throwBindingError('Unsupported HEIC method kind');
 const invoke=(obj,func,destructorsRef,args)=>{
  const values=[];let offset=0;for(const type of types){values.push(type.readValueFromPointer(args+offset));offset+=type.argPackAdvance;}
  const result=kind===1?Reflect.construct(func,values):func.apply(obj,values);
  return retType.isVoid?undefined:emval_returnValue(retType,destructorsRef,result);
 };
 return emval_addMethodCaller(createNamedFunction('methodCaller<'+types.map(t=>t.name).join(', ')+'>',invoke));
};
