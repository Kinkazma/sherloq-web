import "../../runtime-context.js?v=0.25.0";
import {allocateOwnedTypedArray} from './allocation.js';
import {requireValue} from './errors.js';

/** Copy completed native banks in declared order. This function performs no
 * extraction, selection, normalization, matching or deduplication. Inputs stay
 * owned by the caller; the returned tables have one explicit copy owner. */
export function composeSparseNativeFeatureBanks(rows,{budget,origin,descriptorSize,descriptorType=Float32Array,zoneCount=1,preserveMemberships=false,perWindowLimit}={}){
 requireValue(Array.isArray(rows)&&Array.isArray(origin)&&origin.length===2&&origin.every(Number.isFinite)&&[Float32Array,Uint8Array].includes(descriptorType)&&Number.isSafeInteger(descriptorSize)&&descriptorSize>0&&Number.isSafeInteger(zoneCount)&&zoneCount>0&&Number.isSafeInteger(perWindowLimit)&&perWindowLimit>0,'Explicit native bank format, frame and per-window bound required.');
 let count=0;for(const row of rows){const b=row.bank,n=b?.points?.length/7;requireValue(b?.points instanceof Float64Array&&Number.isSafeInteger(n)&&n<=perWindowLimit&&b.descriptors instanceof descriptorType&&b.descriptorSize===descriptorSize&&b.descriptors.length===n*descriptorSize&&b.zoneCount===zoneCount&&b.members instanceof Uint8Array&&b.members.length===n*zoneCount&&Array.isArray(row.origin)&&row.origin.length===2&&row.origin.every(Number.isFinite),'Incompatible native feature bank or per-window bound.');count+=n;}
 requireValue(Number.isSafeInteger(count),'Combined native bank is too large.');const owners=[];
 const allocate=(Type,length,label)=>{const owner=allocateOwnedTypedArray(Type,length,{budget,owner:'declared-window-native-bank',label});owners.push(owner);return owner.data;};
 try{
  const points=allocate(Float64Array,count*7,'native point rows with exact origin translation'),descriptors=allocate(descriptorType,count*descriptorSize,'unchanged native descriptors'),members=allocate(Uint8Array,count*zoneCount,'explicit native memberships'),ranges=[];let offset=0;
  for(const row of rows){const b=row.bank,n=b.points.length/7,dx=row.origin[0]-origin[0],dy=row.origin[1]-origin[1];points.set(b.points,offset*7);for(let i=0;i<n;i++){points[(offset+i)*7]+=dx;points[(offset+i)*7+1]+=dy;}descriptors.set(b.descriptors,offset*descriptorSize);if(preserveMemberships)members.set(b.members,offset*zoneCount);else members.fill(1,offset*zoneCount,(offset+n)*zoneCount);ranges.push({id:row.id,kind:row.kind,fingerprint:row.fingerprint,origin:[...row.origin],pointOffset:offset,pointCount:n,totalFeatures:b.totalFeatures,nativeWholeRectangle:row.nativeWholeRectangle,parameters:row.parameters,nativeMetadata:b.metadata});offset+=n;}
  let released=false;return{points,descriptors,members,descriptorSize,zoneCount,ranges,release(){if(released)return;released=true;for(const owner of owners)owner.release();}};
 }catch(error){for(const owner of owners)owner.release();throw error;}
}
