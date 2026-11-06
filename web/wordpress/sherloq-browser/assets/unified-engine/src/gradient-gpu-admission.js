import "../../runtime-context.js?v=0.31.0";
// Both the useful-operation owner and the actual dispatch must describe the
// same existing renderer. Rectangles become segmented native-grid views;
// observed/masked derivatives and Krawetz retain their native CPU arithmetic.
export function gradientGpuAdmitted(image,params,{cpuKernel='auto',shape='identity'}={}){
 return cpuKernel!=='reference'&&params.method==='sobel'&&(shape==='rectangle'||shape==='identity'&&(image?.segmented||image?.provenance?.decoder==='bounded-parameter-preview'));
}
