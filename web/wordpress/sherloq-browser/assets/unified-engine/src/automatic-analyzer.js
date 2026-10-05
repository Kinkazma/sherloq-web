import "../../runtime-context.js?v=0.14.5";
import {EngineError,requireValue} from './errors.js';
import {automaticAnalysisPlan} from './automatic-analysis-plan.js';
import {createAutomaticAnalysisSession} from './automatic-analysis-session.js';
import {createAutomaticAnalysisView} from './automatic-analysis-view.js';
import {createAutomaticDetectorProviders} from './automatic-detector-providers.js';
import {createAutomaticD2prlProvider} from './automatic-d2prl-provider.js';
import {createAutomaticElaProvider} from './automatic-ela-provider.js';
import {exportAutomaticSession} from './automatic-session-export.js';
import {createRgbSurface} from './rgb-surface.js';

/** Integration facade. Engines and the immutable source are caller-owned and
 * must share budget. Actual dependencies are injected, never substituted. */
export async function createAutomaticAnalyzer({image,imageId,selection,budget,engines={},complete=false,cpu=false,d2Minimum=500,maxConcurrent=5,sparseOptions={},ela={},entryWasmBinary,compositionWasmBinary}={}) {
 const dimensions=image?.surface?.descriptor??image?.pixels??image,{width,height}=dimensions??{};
 requireValue(dimensions?.format==='rgb8'&&typeof budget?.reserve==='function'&&selection,'Qualified original RGB source, explicit selection and shared budget required.');
 const plan=automaticAnalysisPlan({...selection,width,height,complete,cpu,d2Minimum}),view=createAutomaticAnalysisView({complete,width,height});view.setD2prlMinimum(d2Minimum);
 let surface,elaProvider,session,closed=false,disposal;
 try{
  const providers=createAutomaticDetectorProviders({image,budget,dense:engines.dense,sparse:engines.sparse,geometry:engines.geometry,forgeryscope:engines.forgeryscope,sparseOptions,wasmBinary:entryWasmBinary});
  if(engines.d2prl)providers.d2prl=createAutomaticD2prlProvider({adapter:engines.d2prl,image,imageId,wasmBinary:entryWasmBinary});
  if(complete&&plan.jobs.find(j=>j.id==='ela')?.enabled){
   let elaImage=image;
   if(!image.surface){
    const pixels=image.pixels??image;requireValue(pixels.data instanceof Uint8Array&&pixels.data.length===width*height*3,'Original contiguous RGB8 source required.');
    // Borrow source bytes already owned by the caller; only window buffers are
    // admitted/allocated by createRgbSurface. No duplicate full image or resize.
    surface=createRgbSurface({byteLength:pixels.data.byteLength,storage:'memory',readInto(out,offset){out.set(pixels.data.subarray(offset,offset+out.length));}},{width,height,budget,ownsStore:false});
    elaImage={...image,surface};
   }
   elaProvider=createAutomaticElaProvider({...ela,image:elaImage,budget,wasmBinary:entryWasmBinary});providers.ela=elaProvider;
  }
  session=createAutomaticAnalysisSession({plan,providers,budget,maxConcurrent});
  const open=()=>{if(closed)throw new EngineError('DISPOSED','Automatic analyzer disposed.');};
  const filters=input=>{const current=view.getState().d2prlMinimum;requireValue(input?.d2Minimum===undefined||input.d2Minimum===current,'Set the view D2PRL minimum before preparing.');return {...input,d2Minimum:current};};
  return {
   view,plan:structuredClone(plan),snapshot:()=>session.snapshot(),
   run(hooks){open();return session.run(hooks);},resume(request,hooks){open();return session.resume(request,hooks);},cancel(){session.cancel();},
   prepare(input,hooks){open();return session.prepare(filters(input),hooks);},
   visible(frame){open();requireValue(Array.isArray(frame?.entries),'Owned automatic frame required.');return view.visible(frame.entries);},
   acquireResults(){open();return session.acquireResults();},
   export(options={},request={},hooks={}){open();return exportAutomaticSession(session,{...options,image,view:view.getState(),filters:filters(options.filters)},request,{...hooks,budget,wasmBinary:compositionWasmBinary});},
   dispose(){if(disposal)return disposal;closed=true;disposal=(async()=>{try{await session.dispose();}finally{try{await elaProvider?.dispose();}finally{await surface?.dispose();}}})();return disposal;}
  };
 }catch(error){try{await session?.dispose();}finally{try{await elaProvider?.dispose();}finally{await surface?.dispose();}}throw error;}
}
