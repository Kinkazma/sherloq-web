import "../../runtime-context.js?v=0.30.0";
import {requireValue} from './errors.js';
// Call only after native Fourier computation has returned and its defensive
// result clone exists. Source/stage caches already carry their own shared
// budget entries. Completed native FFT scratch has no outstanding child.
// Transfer a live share before releasing scratch: never a zero-credit gap.
export function rebaseFourierViewReservation({budget,reservation,workspaces,knownHeapBytes,resultBytes,ownedBytes,pixels}){
 requireValue(budget?.reserve&&typeof reservation?.split==='function'&&Array.isArray(workspaces)&&Object.isExtensible(workspaces)&&Object.getOwnPropertyDescriptor(workspaces,'length')?.writable&&[knownHeapBytes,resultBytes,ownedBytes,pixels].every(v=>Number.isSafeInteger(v)&&v>=0),'Invalid Fourier presentation envelope.');
 const bytes=knownHeapBytes+resultBytes+ownedBytes+22*pixels+1024**2;requireValue(Number.isSafeInteger(bytes),'Fourier presentation envelope exceeds safe byte accounting.');
 let extra;try{if(bytes>reservation.bytes)extra=budget.reserve(bytes-reservation.bytes);const retained=reservation.split(Math.min(bytes,reservation.bytes));workspaces.push(retained);if(extra){workspaces.push(extra);extra=null;}reservation();return bytes;}catch(error){if(extra){workspaces.push(extra);try{extra();}catch(cleanup){if(error&&typeof error==='object'&&Object.isExtensible(error))error.cleanupErrors=[cleanup];}}throw error;}
}
