import {genericHeldPreviewKey} from './generic-held-preview-owner.js?v=0.32.0';
import {isFrequencyPreviewToken} from './frequency-preview-sizing.js?v=0.32.0';
import {ADAPTIVE_PREVIEW_MAX_SIDE,ADAPTIVE_PREVIEW_MAX_PIXELS} from './preview-limits.js?v=0.32.0';
function settings(event){const path=event.field?.split('.');if(!path?.length)return null;const copy=structuredClone({params:event.params,view:event.view,extras:event.extras??{}}),root=['params','view'].includes(path[0])?path.shift():'params';let value=copy[root];for(const key of path.slice(0,-1))value=value?.[key];const key=path.at(-1);if(!value||typeof value[key]!=='number'||!Number.isFinite(value[key]))return null;delete value[key];return genericHeldPreviewKey(copy);}
const proof=e=>e?.completedPreviewCurrent?.()===true;
export function canContinueFrequencyPreview(a,b){
 try{return a?.phase==='preview'&&['value','preview'].includes(b?.phase)&&a.operation==='detail.frequency'&&b.operation===a.operation&&a.toolId===b.toolId&&a.field===b.field&&a.continuous===true&&b.continuous===true&&a.policy?.kind==='pixel-proxy'&&genericHeldPreviewKey(a.policy)===genericHeldPreviewKey(b.policy)&&Number.isSafeInteger(a.generation)&&a.generation>0&&a.generation===b.generation&&Number.isSafeInteger(a.gestureEpoch)&&a.gestureEpoch>0&&a.gestureEpoch===b.gestureEpoch&&settings(a)!==null&&settings(a)===settings(b)&&proof(a)&&(typeof b.completedPreviewCurrent==='function'?proof(b):b.phase==='value');}catch{return false;}
}
export function completedFrequencyPreviewFrame(a,b,result){
 try{const p=result?.pixels,m=result?.metrics;return canContinueFrequencyPreview(a,b)&&result.exact===false&&m?.schema==='parameter-pixel-proxy/1'&&m.operation==='detail.frequency'&&m.scientificFinalChanged===false&&isFrequencyPreviewToken(m.adaptivePreview?.token)&&p?.format==='rgb8'&&Number.isSafeInteger(p.width)&&p.width>0&&p.width<=ADAPTIVE_PREVIEW_MAX_SIDE&&Number.isSafeInteger(p.height)&&p.height>0&&p.height<=ADAPTIVE_PREVIEW_MAX_SIDE&&p.width*p.height<=ADAPTIVE_PREVIEW_MAX_PIXELS&&p.data instanceof Uint8Array&&p.data.length===p.width*p.height*3;}catch{return false;}
}
