import "../../runtime-context.js?v=0.33.2";
import {selectDecodedRepresentation} from './decoded-source-selection.js';
export function createExistingPingPreflight({header,sourceSamples=header?.sourceSamples,bindingOriginal,origin='existing-q8-ping'}={}){
 if(!['existing-q8-ping','native16-header'].includes(origin))throw new TypeError('Unknown captured source preflight origin.');
 const selection=selectDecodedRepresentation({sourceSamples});
 if(selection.kind!=='high-precision')throw new TypeError('An established HP representation is required.');
 if(!/^[a-f0-9]{64}$/.test(bindingOriginal?.sourceSha256??''))throw new TypeError('Original content identity must precede HP preparation.');
 const model=selection.sourceModel==='indexed'?'RGB':selection.sourceModel;
 const base=model==='GRAY'?'I':model==='CMYK'?'CMYK':'RGB',layout=base+(sourceSamples.alpha.present?'A':'');
 const colors=sourceSamples.channels.filter(c=>c.role==='color'),alpha=sourceSamples.channels.filter(c=>c.role==='alpha');
 const width=header.sourceWidth??header.width,height=header.sourceHeight??header.height,orientation=header.orientation??1;
 if(![width,height].every(v=>Number.isSafeInteger(v)&&v>0)||!Number.isSafeInteger(width*height*5*8)
  ||!Number.isInteger(orientation)||orientation<1||orientation>8)throw new TypeError('The existing Ping grid is invalid.');
 if(origin==='native16-header'&&(selection.sampleType!=='uint16'||Math.max(...colors.map(c=>c.codedBits))!==16))throw new TypeError('The native16 header must establish its actual unsigned16 precision.');
 return Object.freeze({schema:origin==='native16-header'?'sherloq.existing-native16-preflight/1':'sherloq.existing-q8-preflight/1',preservationQualified:false,
  width,height,orientation,model,layout,channels:layout.length,alpha:alpha.length>0,
  sourceDepth:Math.max(...colors.map(c=>c.codedBits)),alphaDepth:alpha.length?Math.max(...alpha.map(c=>c.codedBits)):0,
  sourceSampleFormat:selection.sampleType==='float32'?'float':'uint',decodedSampleFormat:selection.sampleType,
  requiredQuantumDepth:selection.quantumDepth,iccProfileLength:0,
  sourceIntegerPrecisionExact:selection.sampleType==='uint16',precisionOrigin:origin==='native16-header'?'same-existing-native16-header':'same-existing-q8-ping',
  sourceSha256:bindingOriginal.sourceSha256,bindingOriginal:Object.freeze({...bindingOriginal}),
  sourceSamples,orientationApplied:false,colorConversionApplied:false});
}

// The header admits resources; only the useful Read establishes the exported grid.
export function validateNative16SourceRead(preflight,header){
 if(preflight?.schema!=='sherloq.existing-native16-preflight/1')return;
 if(header.width!==preflight.width||header.height!==preflight.height
  ||header.orientation!==preflight.orientation||header.sourceDepth!==16
  ||header.sourceSampleFormat!=='uint'||header.decodedSampleFormat!=='uint16')
  throw new Error('The useful Read differs from the captured native16 grid or precision.');
}
