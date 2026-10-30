import "../../runtime-context.js?v=0.30.0";
// Capability check only: validate never executes a Wasm instruction, schedules
// useful work or benchmarks the machine. Original scalar resources remain.
const SIMD_TYPE_PROBE=Uint8Array.of(0,97,115,109,1,0,0,0,1,5,1,96,0,1,123,3,2,1,0,10,22,1,20,0,253,12,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,11);
let simdCapability;
export function ssgHasSimdCapability(){if(simdCapability===undefined){try{simdCapability=typeof WebAssembly?.validate==='function'&&WebAssembly.validate(SIMD_TYPE_PROBE);}catch{simdCapability=false;}}return simdCapability;}
export function ssgLocalizationModuleUrl(folder,options={},simd=options.ssgUseSimd!==false&&ssgHasSimdCapability()){
 if(folder!=='ssg-full'&&folder!=='ssg-strict')throw new TypeError('Invalid SSG localization module family.');
 const family=simd?'ssg-ssim-simd/'+folder:folder,name=options.ssgShared?'localization-shared.mjs':'localization.mjs';return new URL('../vendor/'+family+'/'+name,import.meta.url);
}
export async function createSsgLocalizationModule(folder,options,dependencies={}){
 const capable=options?.ssgUseSimd!==false&&(dependencies.supportsSimd??ssgHasSimdCapability)(),url=ssgLocalizationModuleUrl(folder,options,capable),load=dependencies.importModule??(url=>import(url.href)),factory=(await load(url)).default;
 // No constructor-error fallback: the existing Native owner must retire any
 // adopted resources and preserve its primary, including0/frozen errors.
 return factory({...options,mainScriptUrlOrBlob:globalThis.process?.versions?.node?decodeURIComponent(url.pathname):url.href});
}
