import {nativePreviewAnswerOwned} from './native-preview-answer.js?v=0.33.3';
import {nativePreviewAnswerRecord} from './unified-engine/src/native-preview-peer-finance.js';
import {native16TransformPreviewLayout} from './unified-engine/src/native16-transform-preview-layout.js';
import {genericHeldPreviewKey} from './generic-held-preview-owner.js?v=0.33.3';
import {isFrequencyPreviewToken} from './frequency-preview-sizing.js?v=0.33.3';
import {ADAPTIVE_PREVIEW_MAX_SIDE,ADAPTIVE_PREVIEW_MAX_PIXELS} from './preview-limits.js?v=0.33.3';
function settings(event){const path=event.field?.split('.');if(!path?.length)return null;const copy=structuredClone({params:event.params,view:event.view,extras:event.extras??{}}),root=['params','view'].includes(path[0])?path.shift():'params';let value=copy[root];for(const key of path.slice(0,-1))value=value?.[key];const key=path.at(-1);if(!value||typeof value[key]!=='number'||!Number.isFinite(value[key]))return null;delete value[key];return genericHeldPreviewKey(copy);}
const proof=e=>e?.completedPreviewCurrent?.()===true;
export function canContinueFrequencyPreview(a,b){
 try{return a?.phase==='preview'&&['value','preview'].includes(b?.phase)&&a.operation==='detail.frequency'&&b.operation===a.operation&&a.toolId===b.toolId&&a.field===b.field&&a.continuous===true&&b.continuous===true&&a.policy?.kind==='pixel-proxy'&&genericHeldPreviewKey(a.policy)===genericHeldPreviewKey(b.policy)&&Number.isSafeInteger(a.generation)&&a.generation>0&&a.generation===b.generation&&Number.isSafeInteger(a.gestureEpoch)&&a.gestureEpoch>0&&a.gestureEpoch===b.gestureEpoch&&settings(a)!==null&&settings(a)===settings(b)&&proof(a)&&(typeof b.completedPreviewCurrent==='function'?proof(b):b.phase==='value');}catch{return false;}
}
// A completed native frame is financed by its captured Original owner. It
// does not impersonate a source-grid owner or publication from Frequency v9.
function completedNativeFrequencyFrame(a,b,result){
 const p=result?.pixels,m=result?.metrics,row=nativePreviewAnswerRecord(result),state=row?.frame?.state,binding=row?.frame?.binding;
 if(!canContinueFrequencyPreview(a,b)||result.exact!==false||m?.schema!=='parameter-pixel-proxy/1'||m.operation!=='detail.frequency'||m.scientificFinalChanged!==false
  ||!nativePreviewAnswerOwned(result)||!row||row.retired||row.retiring||row.constructionOwner||!state||state.retired||state.closing||state.dtoAcknowledged||state.rgbOwned!==true)return false;
 const sourceIdentity=Array.isArray(m.sourceIdentity)?m.sourceIdentity[0]:m.sourceIdentity;
 if(sourceIdentity!==binding?.sourceSha256||p?.format!=='rgb8'||![p.width,p.height,p.logicalWidth,p.logicalHeight].every(n=>Number.isSafeInteger(n)&&n>0)
  ||p.width>ADAPTIVE_PREVIEW_MAX_SIDE||p.height>ADAPTIVE_PREVIEW_MAX_SIDE||p.width*p.height>ADAPTIVE_PREVIEW_MAX_PIXELS
  ||!(p.data instanceof Uint8Array)||p.data.length!==p.width*p.height*3)return false;
 if(!Array.isArray(m.inputDimensions)||m.inputDimensions.length!==2||!Array.isArray(m.outputDimensions)||m.outputDimensions.length!==2)return false;
 const expected=native16TransformPreviewLayout('detail.frequency',{width:m.inputDimensions[0],height:m.inputDimensions[1],logicalWidth:p.logicalWidth,logicalHeight:p.logicalHeight},a.view),layout=m.nativeTransformPreviewLayout;
 return !!layout&&Object.keys(expected).every(key=>layout[key]===expected[key])&&p.width===expected.outputWidth&&p.height===expected.outputHeight
  &&m.outputDimensions[0]===p.width&&m.outputDimensions[1]===p.height&&p.previewCoordinates===expected.coordinates;
}
export function completedFrequencyPreviewFrame(a,b,result){
 try{const p=result?.pixels,m=result?.metrics;if(m?.nativeInputDepth===16)return completedNativeFrequencyFrame(a,b,result);return canContinueFrequencyPreview(a,b)&&result.exact===false&&m?.schema==='parameter-pixel-proxy/1'&&m.operation==='detail.frequency'&&m.scientificFinalChanged===false&&isFrequencyPreviewToken(m.adaptivePreview?.token)&&p?.format==='rgb8'&&Number.isSafeInteger(p.width)&&p.width>0&&p.width<=ADAPTIVE_PREVIEW_MAX_SIDE&&Number.isSafeInteger(p.height)&&p.height>0&&p.height<=ADAPTIVE_PREVIEW_MAX_SIDE&&p.width*p.height<=ADAPTIVE_PREVIEW_MAX_PIXELS&&p.data instanceof Uint8Array&&p.data.length===p.width*p.height*3;}catch{return false;}
}
