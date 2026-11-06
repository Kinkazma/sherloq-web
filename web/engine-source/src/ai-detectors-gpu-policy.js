// Qualification follows the actual browser engine. WebKit's GPU worker
// retirement produced a native GPUDevice::contextDestroyed SIGSEGV; use CPU
// there until that complete lifecycle is independently qualified again.
export const AI_GPU_BROWSER_FAMILIES=Object.freeze(['chromium','firefox']);
export function aiDetectorBrowserFamily(userAgent=globalThis.navigator?.userAgent??''){
 if(/Firefox\//.test(userAgent))return'firefox';
 if(/(?:Chrome|Chromium|Edg|OPR)\//.test(userAgent))return'chromium';
 if(/AppleWebKit\//.test(userAgent))return'webkit';
 return'unknown';
}
export function aiDetectorGpuMethods(configuration,{gpuAvailable=!!globalThis.navigator?.gpu,userAgent=globalThis.navigator?.userAgent??''}={}){
 const family=aiDetectorBrowserFamily(userAgent);
 const families=Array.isArray(configuration?.gpuQualifiedBrowserFamilies)?configuration.gpuQualifiedBrowserFamilies:[];
 if(!gpuAvailable||!AI_GPU_BROWSER_FAMILIES.includes(family)||!families.includes(family))return[];
 return Array.isArray(configuration?.gpuQualifiedMethods)?configuration.gpuQualifiedMethods.filter(method=>['dda','prl','community-forensics','gapl'].includes(method)):[];
}
