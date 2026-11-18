// Presentation geometry. The engine's binary64 model and observations
// remain unchanged; only the vertex buffer is converted to Float32.
export function pcaCloudScene(data){
 const {cloud,mean,eigenvectors:v,eigenvalues:lambda}=data??{},native=data?.inputDepth===16,rgb=native?cloud?.rgb16:cloud?.rgb,maximum=native?65535:255;if(native&&(!(rgb instanceof Uint16Array)||rgb.length!==cloud.count*3))throw Error('Invalid native16 PCA cloud coordinates.');
 if(data?.channelOrder!=='BGR'||!cloud||!(cloud.rgb instanceof Uint8Array)||!Number.isSafeInteger(cloud.total)||cloud.total<1||!Number.isInteger(cloud.stride)||cloud.stride<1||cloud.count!==Math.ceil(cloud.total/cloud.stride)||cloud.rgb.length!==cloud.count*3||cloud.count>131072||mean?.length!==3||v?.length!==9||lambda?.length!==3||![...mean,...v,...lambda].every(Number.isFinite))throw Error('Invalid PCA cloud/model.');
 // Bound the complete RGB cube under this model, rather than stretching the
 // sampled extrema independently. One scale preserves the variance ratios.
 let radius=0;
 for(let k=0;k<3;k++){
  let lo=0,hi=0;
  for(let c=0;c<3;c++){const a=-mean[c]*v[k*3+c],b=(maximum-mean[c])*v[k*3+c];lo+=Math.min(a,b);hi+=Math.max(a,b);}
  radius=Math.max(radius,Math.abs(lo),Math.abs(hi));
 }
 radius=Math.max(1,radius);
 const scores=rgb=>{const b=rgb[2]-mean[0],g=rgb[1]-mean[1],r=rgb[0]-mean[2];return [0,1,2].map(k=>(b*v[k*3]+g*v[k*3+1])+r*v[k*3+2]);};
 const vertex=rgb=>[rgb[0]/maximum,rgb[1]/maximum,rgb[2]/maximum,...scores(rgb).map(x=>.5+x/(2*radius))];
 const values=new Float32Array(cloud.count*6);
 for(let i=0;i<cloud.count;i++)values.set(vertex(rgb.subarray(i*3,i*3+3)),i*6);
 const center=[mean[2],mean[1],mean[0]],guideSegments=[];
 const totalVariance=Array.from(lambda,x=>Math.max(0,x)).reduce((a,b)=>a+b,0),explainedVariance=Array.from(lambda,x=>totalVariance?Math.max(0,x)/totalVariance:0);
 for(let k=0;k<3;k++){
  if(lambda[k]<=0)continue;
  const direction=[v[k*3+2],v[k*3+1],v[k*3]],sigma=2*Math.sqrt(lambda[k]);
  let low=sigma,high=sigma;
  for(let c=0;c<3;c++)if(direction[c]){const a=(0-center[c])/direction[c],b=(maximum-center[c])/direction[c];low=Math.min(low,-Math.min(a,b));high=Math.min(high,Math.max(a,b));}
  const from=vertex(center.map((x,c)=>x-direction[c]*low)),to=vertex(center.map((x,c)=>x+direction[c]*high));
  guideSegments.push({from,to,label:'PC'+(k+1),color:['#52c68c','#7e9eff','#f2b464'][k]});
 }
 return {points:{values,count:cloud.count,total:cloud.total,...(native?{displayColors:cloud.rgb}:{})},columns:['R','G','B','PC1','PC2','PC3'],guideSegments,explainedVariance,radius,
  axisLabels:['R '+maximum,'G '+maximum,'B '+maximum,...['PC1','PC2','PC3'].map(k=>k+' +'+radius.toFixed(1))],
  scores,coordinateScale:2*radius,sampling:cloud.sampling,inputDomain:cloud.inputDomain};
}
