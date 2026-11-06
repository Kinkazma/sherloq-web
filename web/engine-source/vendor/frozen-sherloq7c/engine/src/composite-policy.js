// Scientific policy shared with the pinned native Python assets. No UI tuning.
export const COMPOSITE_STATISTICS_POLICY='covariance-floor-v1';
export const COMPOSITE_STATISTICS_REVISION='covariance-floor-v1/banked-global-scale-1';
export function compositePolicyMetadata(fields){
 return {statistics_policy:COMPOSITE_STATISTICS_POLICY,covariance_regularizations:Number(fields.covariance_regularizations?.[0]??0),pca_regularized_components:Number(fields.pca_regularized_components?.[0]??0),...(fields.covariance_reference_scale?{covariance_reference_scale:Number(fields.covariance_reference_scale[0])}:{})};
}
