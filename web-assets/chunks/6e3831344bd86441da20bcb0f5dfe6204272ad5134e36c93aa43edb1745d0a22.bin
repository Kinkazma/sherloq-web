import "../../runtime-context.js?v=0.33.0";
import {createTruforMiniAnalyzer} from './trufor-mini-analyzer.js';
import {createTruforMiniStrictAnalyzer} from './trufor-mini-strict-analyzer.js';
import {truforStrictResultContext} from './trufor-strict-result.js';
import {EngineError} from './errors.js';

/** One Mini model owns native and independently admitted-context execution. */
export function createTruforMiniSourceRegionRouter(configuration={}){
 const {nativeFactory=createTruforMiniAnalyzer,...options}=configuration,native=nativeFactory(options),strict=createTruforMiniStrictAnalyzer({...options,analyzer:native});let busy=false;
 return {
  async analyze(image,params,options){if(busy)throw new EngineError('BUSY','TruFor Mini analysis is active.');busy=true;try{return await(image.strictTruforMiniContexts?strict:native).analyze(image,params,options);}finally{busy=false;}},
  render(result,view,options){return result.data?.metadata?.fragmented?strict.render(truforStrictResultContext(result).image,result,view,options):native.render(result,view,options);},
  renderWindow(image,result,view,rect,options){return(result.data?.metadata?.fragmented?strict:native).renderWindow(image,result,view,rect,options);},
  clearCache(){return strict.clearCache();},dispose(){return strict.dispose();},memory(){return native.memory();}
 };
}
