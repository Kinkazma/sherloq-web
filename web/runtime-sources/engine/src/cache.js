import {EngineError} from './errors.js';
export class Budget {
 constructor(limit) {this.limit=limit;this.retained=0;this.active=0;this.cacheBytes=0;this.peak=0;this.cache=new Map();}
 total(){return this.retained+this.active+this.cacheBytes;}
 room(bytes) {
  while(this.total()+bytes>this.limit&&this.cache.size) this.remove(this.cache.keys().next().value);
  if(this.total()+bytes>this.limit) throw new EngineError('MEMORY_LIMIT','Image or task exceeds the memory budget.');
 }
 reserve(bytes) {this.room(bytes);this.active+=bytes;this.peak=Math.max(this.peak,this.total());return()=>{this.active-=bytes;};}
 retain(bytes){this.room(bytes);this.retained+=bytes;this.peak=Math.max(this.peak,this.total());}
 remove(key){const v=this.cache.get(key);if(v){this.cacheBytes-=v.byteLength;this.cache.delete(key);}}
 get(key){const v=this.cache.get(key);if(v){this.cache.delete(key);this.cache.set(key,v);}return v;}
 put(key,value){this.remove(key);if(value.byteLength+this.retained+this.active>this.limit)return;this.room(value.byteLength);this.cache.set(key,value);this.cacheBytes+=value.byteLength;this.peak=Math.max(this.peak,this.total());}
 clearPrefix(prefix){for(const key of this.cache.keys()) if(key.startsWith(prefix))this.remove(key);}
 clear(){this.cache.clear();this.cacheBytes=0;this.retained=0;}
 snapshot(){return {budgetBytes:this.limit,retainedBytes:this.retained,cacheBytes:this.cacheBytes,activeReservationBytes:this.active,peakAccountedBytes:this.peak};}
}
