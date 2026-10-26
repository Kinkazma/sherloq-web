import "../../runtime-context.js?v=0.25.0";
/** Append actual native observations, retaining their context and Original grid.
 * The caller supplies its usual bounded CSV writer. No result is recomputed. */
export function appendNativeJpegContextCsv(result,line){
 if(!['jpeg.quality','jpeg.recompression'].includes(result?.operation)||result.data?.independentNativeContexts!==true)return false;
 line(['context_index','original_x0','original_y0','original_x1','original_y1','status','jpeg_quality','mean_absolute_pixel_error_0_255','normalized_loss']);
 for(let context=0;context<result.data.fragments.length;context++){
  const fragment=result.data.fragments[context],prefix=[context,...fragment.originalBounds,fragment.evaluable?'analysed':'native-not-evaluable'];
  if(!fragment.evaluable){line([...prefix,'','','']);continue;}
  const data=fragment.data;for(let i=0;i<data.qualities.length;i++)line([...prefix,data.qualities[i],data.raw[i],data.curve?.[i]??'']);
 }
 return true;
}
