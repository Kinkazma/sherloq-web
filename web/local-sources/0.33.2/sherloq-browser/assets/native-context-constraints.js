import {createSourceRegionView} from './unified-engine/src/source-region-view.js';
// Filter lengths copied from unchanged native PyWavelets metadata,59 names.
// This is UI admission metadata, not a transform or new scientific kernel.
export const nativeWaveletFilterLengths=Object.freeze({"db1":2,"db2":4,"db3":6,"db4":8,"db5":10,"db6":12,"db7":14,"db8":16,"db9":18,"db10":20,"db11":22,"db12":24,"db13":26,"db14":28,"db15":30,"db16":32,"db17":34,"db18":36,"db19":38,"db20":40,"sym2":4,"sym3":6,"sym4":8,"sym5":10,"sym6":12,"sym7":14,"sym8":16,"sym9":18,"sym10":20,"sym11":22,"sym12":24,"sym13":26,"sym14":28,"sym15":30,"sym16":32,"sym17":34,"sym18":36,"sym19":38,"sym20":40,"coif1":6,"coif2":12,"coif3":18,"coif4":24,"coif5":30,"bior1.1":2,"bior1.3":6,"bior1.5":10,"bior2.2":6,"bior2.4":10,"bior2.6":14,"bior2.8":18,"bior3.1":4,"bior3.3":8,"bior3.5":12,"bior3.7":16,"bior3.9":20,"bior4.4":10,"bior5.5":12,"bior6.8":18});
export function nativeWaveletMaximum(width,height,wavelet){const length=nativeWaveletFilterLengths[wavelet];if(!length||!Number.isSafeInteger(width)||!Number.isSafeInteger(height)||width<1||height<1)return null;return Math.max(0,Math.floor(Math.log2(Math.min(width,height)/(length-1))));}
export async function nativeParameterContexts({width,height,sourceSha256,sourceRegionDomain},{signal}={}){
 if(!Number.isSafeInteger(width)||!Number.isSafeInteger(height)||width<1||height<1)throw new TypeError('The original native grid is required.');
 if(!sourceRegionDomain)return[{width,height,originalBounds:[0,0,width,height]}];
 let view;try{view=await createSourceRegionView({descriptor:{width,height},...(sourceSha256?{sha256:sourceSha256}:{}),readWindow(){throw Error('Geometry admission must not read RGB.');}},sourceRegionDomain,{signal});return[...view.admittedRectangles()].map(r=>({width:r.width,height:r.height,originalBounds:[view.domain.origin[0]+r.x,view.domain.origin[1]+r.y,view.domain.origin[0]+r.x+r.width,view.domain.origin[1]+r.y+r.height]}));}catch(error){if(error?.code==='SOURCE_SCOPE_EMPTY')return[];throw error;}finally{await view?.dispose();}
}
export function nativeParameterConstraint(operation,key,{width,height,nativeContexts,wavelet='db1'}={}){
 if(!(operation==='detail.wavelets'&&key==='level'||operation==='noise.blocking'&&key==='block'))return null;
 const contexts=nativeContexts??(Number.isSafeInteger(width)&&width>0&&Number.isSafeInteger(height)&&height>0?[{width,height}]:null);if(!contexts)return null;
 if(operation==='detail.wavelets'){const rows=contexts.map(r=>({...r,maximumLevel:nativeWaveletMaximum(r.width,r.height,wavelet)}));if(rows.some(r=>r.maximumLevel===null))return null;return{min:0,max:Math.min(30,Math.max(0,...rows.map(r=>r.maximumLevel))),step:1,nullable:true,preserveRequest:true,nativeKind:'wavelets',nativeContexts:rows};}
 const rows=contexts.map(r=>({...r,detailDimensions:[Math.floor((r.width+15)/2),Math.floor((r.height+15)/2)]}));return{min:1,max:rows.length?Math.min(100,...rows.map(r=>Math.min(...r.detailDimensions))):0,step:1,nullable:false,preserveRequest:true,nativeKind:'blocking',nativeContexts:rows};
}
