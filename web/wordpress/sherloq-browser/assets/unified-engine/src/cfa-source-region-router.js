import "../../runtime-context.js?v=0.25.0";
import {createCfaAnalyzer} from './cfa-analyzer.js';
import {createCfaStrictAnalyzer} from './cfa-strict-analyzer.js';
import {EngineError} from './errors.js';

/** One native model/pool and one cache, with separate explicit input contracts.
 * Installing this router does not itself admit a new source-domain shape. */
export function createCfaSourceRegionRouter(configuration={}) {
 const {nativeFactory=createCfaAnalyzer,...nativeConfiguration}=configuration;
 const native=nativeFactory(nativeConfiguration),strict=createCfaStrictAnalyzer({...nativeConfiguration,analyzer:native});let busy=false;
 const api={
  async analyze(image,params,options){if(busy)throw new EngineError('BUSY','CFA analysis already running.');busy=true;try{return await(image.strictCfaContexts?strict:native).analyze(image,params,options);}finally{busy=false;}},
  render(image,result,mode,options){return(result.data?.metadata?.fragmented?strict:native).render(image,result,mode,options);},
  renderWindow(image,result,mode,rect,options){return(result.data?.metadata?.fragmented?strict:native).renderWindow(image,result,mode,rect,options);},
  exportNpz(result){return native.exportNpz(result);},
  clearCache(){return strict.clearCache();},
  dispose(){return strict.dispose();},
  memory(){return native.memory();}
 };
 return api;
}
