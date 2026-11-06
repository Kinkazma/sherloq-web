import "../../runtime-context.js?v=0.31.0";
/** Stable explicit-memory order of positive source levels. No native .sort. */
export async function projectionTopologicalOrder(levels,options={}) {
  const n=levels.length,order=new Uint32Array(n);let histogram=new Uint32Array(65537),native=true,channel=null,pending=null,work=0;
  const yieldNow=options.cooperate||(()=>new Promise(resolve=>{if(!channel){channel=new MessageChannel();channel.port1.onmessage=()=>{const f=pending;pending=null;f?.();};}pending=resolve;channel.port2.postMessage(0);}));
  const checkpoint=async()=>{if(options.signal?.aborted||options.shouldCancel?.())throw Object.assign(new Error('Projection source order cancelled'),{name:'AbortError',code:'CANCELLED'});await yieldNow();};
  try {
    for(let i=0;i<n;i++) {
      const value=levels[i],key=Math.round(value*65535);order[i]=i;
      if(!(value>=0&&value<=1&&Number.isFinite(value)))throw new Error('Invalid source level');
      if(key/65535!==value)native=false;
      if(native)histogram[key+1]++;
      if(++work===16384){work=0;await checkpoint();}
    }
    if(native) {
      for(let i=1;i<histogram.length;i++){histogram[i]+=histogram[i-1];if(++work===16384){work=0;await checkpoint();}}
      for(let i=0;i<n;i++){order[histogram[Math.round(levels[i]*65535)]++]=i;if(++work===16384){work=0;await checkpoint();}}
      if(options.signal?.aborted||options.shouldCancel?.())throw Object.assign(new Error('Projection source order cancelled'),{name:'AbortError',code:'CANCELLED'});
      return {indices:order,backend:'native16-counting',scratchBytes:65537*4};
    }
    histogram=null;
    const less=(a,b)=>levels[a]<levels[b]||(levels[a]===levels[b]&&a<b);
    // In-place heap order, tie-breaking by original index gives the same
    // stable order as sorting [0..n) with the former numerical comparator.
    for(let start=(n>>>1)-1;start>=0;start--) {
      let root=start;
      while(root*2+1<n) {
        let child=root*2+1;if(child+1<n&&less(order[child],order[child+1]))child++;
        if(!less(order[root],order[child]))break;
        const swap=order[root];order[root]=order[child];order[child]=swap;root=child;
        if(++work===16384){work=0;await checkpoint();}
      }
      if(++work===16384){work=0;await checkpoint();}
    }
    for(let end=n-1;end>0;end--) {
      const swap=order[0];order[0]=order[end];order[end]=swap;let root=0;
      while(root*2+1<end) {
        let child=root*2+1;if(child+1<end&&less(order[child],order[child+1]))child++;
        if(!less(order[root],order[child]))break;
        const value=order[root];order[root]=order[child];order[child]=value;root=child;
        if(++work===16384){work=0;await checkpoint();}
      }
      if(++work===16384){work=0;await checkpoint();}
    }
    if(options.signal?.aborted||options.shouldCancel?.())throw Object.assign(new Error('Projection source order cancelled'),{name:'AbortError',code:'CANCELLED'});
    return {indices:order,backend:'f64-inplace-heapsort',scratchBytes:65537*4};
  }finally{channel?.port1.close();channel?.port2.close();}
}
