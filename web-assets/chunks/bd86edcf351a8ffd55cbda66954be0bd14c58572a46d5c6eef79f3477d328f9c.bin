import "../../runtime-context.js?v=0.30.0";
import{createTruforAnalyzer}from'./trufor-analyzer.js';
import{createTruforStrictAnalyzer}from'./trufor-strict-analyzer.js';
import{truforStrictResultContext}from'./trufor-strict-result.js';
import{EngineError}from'./errors.js';
/** Installing the router never opens the M2 admission. Exactly one unchanged
 * native analyzer owns both paths, serialized by this owner. */
export function createTruforSourceRegionRouter(configuration={}){
 const{nativeFactory=createTruforAnalyzer,...options}=configuration,native=nativeFactory(options),strict=createTruforStrictAnalyzer({...options,analyzer:native});let busy=false;
 return{
  async analyze(image,params,options){if(busy)throw new EngineError('BUSY','TruFor analysis is active.');busy=true;try{return await(image.strictTruforContexts?strict:native).analyze(image,params,options);}finally{busy=false;}},
  render(result,view,options){return result.data?.metadata?.fragmented?strict.render(truforStrictResultContext(result).image,result,view,options):native.render(result,view,options);},
  renderWindow(image,result,view,rect,options){return(result.data?.metadata?.fragmented?strict:native).renderWindow(image,result,view,rect,options);},
  exportNpz(result){return native.exportNpz(result);},
  clearCache(){return strict.clearCache();},dispose(){return strict.dispose();},memory(){return native.memory();}
 };
}
