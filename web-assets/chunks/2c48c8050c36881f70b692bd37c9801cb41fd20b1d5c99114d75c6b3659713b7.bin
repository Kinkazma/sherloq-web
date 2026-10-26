import "../../runtime-context.js?v=0.25.0";
import {createRitaAnalyzer} from './rita-analyzer.js';
import {createRitaStrictAnalyzer} from './rita-strict-analyzer.js';
import {sampleRitaStrictWindow,renderRitaStrictWindow} from './rita-strict-render.js';
import {EngineError} from './errors.js';

/** Whole images and ordinary rectangles retain their existing analyzer path.
 * A strict result is not accepted until its named scientific source transport
 * has been checked independently by the M2 host. */
export function createRitaSourceRegionRouter({nativeFactory=createRitaAnalyzer,...configuration}={}){
 const native=nativeFactory(configuration),strict=createRitaStrictAnalyzer({...configuration,analyzer:native});let busy=false;
 return{
  async analyze(image,params,options){if(busy)throw new EngineError('BUSY','RITA analysis is active.');busy=true;try{return await(image.strictRitaContexts?strict:native).analyze(image,params,options);}finally{busy=false;}},
  render(image,result,view,options){return result.data?.metadata?.fragmented?renderRitaStrictWindow(image,result,view,{x:0,y:0,width:result.data.width,height:result.data.height},{...options,budget:configuration.budget}):native.render(image,result,view,options);},
  renderWindow(image,result,view,rect,options){return result.data?.metadata?.fragmented?renderRitaStrictWindow(image,result,view,rect,{...options,budget:configuration.budget}):native.renderWindow(image,result,view,rect,options);},
  sampleWindow(image,result,view,tile,options){return sampleRitaStrictWindow(image,result,view,tile,{...options,budget:configuration.budget});},
  clearCache(){return strict.clearCache();},dispose(){return strict.dispose();},memory(){return native.memory();}
 };
}
