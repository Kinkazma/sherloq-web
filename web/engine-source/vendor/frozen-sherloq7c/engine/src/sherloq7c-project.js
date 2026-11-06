/** Sherloq 7C private research projection, CPU Float64 OSQP/WASM.
 * Caller owns this instance and must call dispose(). No implicit global cache.
 * Source graph/targets use normalized native values, including true Uint16.
 */
import createOSQPModule from './wasm/osqp.mjs';
import {projectionTopologicalOrder} from './sherloq7c-topological-order.js';

export function reduceProjectionEdges(p) {
  const n=p.levels.length,e=p.low.length;
  const offsets=new Uint32Array(n+1),order=new Uint32Array(e);
  for(let k=0;k<e;k++)offsets[p.low[k]+1]++;
  for(let i=0;i<n;i++)offsets[i+1]+=offsets[i];
  const cursor=offsets.slice(0,n);
  for(let k=0;k<e;k++)order[cursor[p.low[k]]++]=k;
  const mark=new Uint32Array(n),edgeAt=new Uint32Array(n),drop=new Uint8Array(e);
  for(let i=0;i<n;i++) {
    const epoch=i+1;
    for(let a=offsets[i];a<offsets[i+1];a++) {
      const k=order[a],j=p.high[k];mark[j]=epoch;edgeAt[j]=k;
    }
    for(let a=offsets[i];a<offsets[i+1];a++) {
      const middle=p.high[order[a]];
      for(let b=offsets[middle];b<offsets[middle+1];b++) {
        const end=p.high[order[b]];
        if(mark[end]===epoch)drop[edgeAt[end]]=1;
      }
    }
  }
  let kept=0;for(let k=0;k<e;k++)if(!drop[k])kept++;
  const result=new Uint32Array(kept);let at=0;
  for(let k=0;k<e;k++)if(!drop[k])result[at++]=k;
  return result;
}

/** Same exact reduction, with task checkpoints for large source graphs. */
export async function reduceProjectionEdgesCooperative(p,options={}) {
  const n=p.levels.length,e=p.low.length;
  const offsets=new Uint32Array(n+1),order=new Uint32Array(e);
  let channel=null,resolveYield=null,work=0;
  const cooperate=options.cooperate || (()=>new Promise(resolve=>{
    if(!channel){channel=new MessageChannel();channel.port1.onmessage=()=>{const r=resolveYield;resolveYield=null;r?.();};}
    resolveYield=resolve;channel.port2.postMessage(0);
  }));
  async function checkpoint() {
    if(options.signal?.aborted || options.shouldCancel?.())throw abortError();
    await cooperate();
  }
  try {
    for(let k=0;k<e;k++){offsets[p.low[k]+1]++;if(++work===32768){work=0;await checkpoint();}}
    for(let i=0;i<n;i++){offsets[i+1]+=offsets[i];if(++work===32768){work=0;await checkpoint();}}
    const cursor=offsets.slice(0,n);
    for(let k=0;k<e;k++){order[cursor[p.low[k]]++]=k;if(++work===32768){work=0;await checkpoint();}}
    const mark=new Uint32Array(n),edgeAt=new Uint32Array(n),drop=new Uint8Array(e);
    for(let i=0;i<n;i++) {
      const epoch=i+1;
      for(let a=offsets[i];a<offsets[i+1];a++) {
        const k=order[a],j=p.high[k];mark[j]=epoch;edgeAt[j]=k;
      }
      for(let a=offsets[i];a<offsets[i+1];a++) {
        const middle=p.high[order[a]];
        for(let b=offsets[middle];b<offsets[middle+1];b++) {
          const end=p.high[order[b]];
          if(mark[end]===epoch)drop[edgeAt[end]]=1;
          if(++work===32768){work=0;await checkpoint();}
        }
      }
    }
    let kept=0;for(let k=0;k<e;k++)if(!drop[k])kept++;
    const result=new Uint32Array(kept);let at=0;
    for(let k=0;k<e;k++)if(!drop[k])result[at++]=k;
    if(options.signal?.aborted || options.shouldCancel?.())throw abortError();
    return result;
  } finally {channel?.port1.close();channel?.port2.close();}
}

function abortError() { const e=new Error('Sherloq projection cancelled');e.name='AbortError';return e; }

/** A strict WebAssembly.Memory maximum is supplied before any solver allocation.
 * The framework must reserve/account this worker heap under its existing owner.
 */
export async function createProjectionOSQP(p,options={}) {
  const n=p.levels.length,E=p.low.length,N=p.width*p.height || p.labels.length;
  if(!n || p.high.length!==E || p.difference.length!==E)throw new Error('Invalid prepared graph');
  let lo=Infinity,hi=-Infinity;
  for(const v of p.levels){if(!Number.isFinite(v)||v<0||v>1)throw new Error('Invalid native levels');lo=Math.min(lo,v);hi=Math.max(hi,v);}
  const counts=p.counts || Float64Array.from(p.area,a=>a*N);
  const baseline=new Float64Array(n),freeIndex=new Int32Array(n).fill(-1),free=[];
  for(let i=0;i<n;i++) {
    if(!(counts[i]>0))throw new Error('Invalid component mass');
    baseline[i]=hi===lo?p.levels[i]:(p.levels[i]-lo)/(hi-lo);
    if(p.levels[i]!==lo && p.levels[i]!==hi){freeIndex[i]=free.length;free.push(i);}
  }
  const first=new Uint32Array(n).fill(0xffffffff);
  if(p.labels)for(let i=0;i<p.labels.length;i++)if(first[p.labels[i]]===0xffffffff)first[p.labels[i]]=i;
  const component=(a)=>{
    if(a.length===n)return a;
    if(a.length!==N || !p.labels)throw new Error('Wrong target length');
    return Float64Array.from(first,i=>a[i]);
  };
  let disposed=false,busy=false,solveNumber=0;
  if(!free.length) return {
    async solve(){if(disposed)throw new Error('Disposed projection');return {z:baseline.slice(),lambda:options.returnDual===false?null:new Float64Array(E),info:{constant:true,onlyEndpointComponents:true,backend:'cpu-wasm-osqp',iterations:0,memoryBytes:0,certificateMax:0,certificateRMS:0,gap:0}};},
    dispose(){disposed=true;},get memoryBytes(){return 0;}
  };
  const started=performance.now();
  const kept=options.reduce===false?Uint32Array.from({length:E},(_,i)=>i):await reduceProjectionEdgesCooperative(p,options);
  const K=kept.length,F=free.length,M=K+F;
  const rho=options.rho??.1,lower=new Float64Array(M),upper=new Float64Array(M).fill(1e30);
  const colptr=new Int32Array(F+1);
  for(let k=0;k<K;k++) {
    const e=kept[k],l=p.low[e],h=p.high[e];
    if(freeIndex[l]>=0)colptr[freeIndex[l]+1]++;
    if(freeIndex[h]>=0)colptr[freeIndex[h]+1]++;
    lower[k]=rho*p.difference[e]-(freeIndex[h]<0?baseline[h]:0)+(freeIndex[l]<0?baseline[l]:0);
  }
  for(let f=0;f<F;f++){colptr[f+1]++;lower[K+f]=0;upper[K+f]=1;}
  for(let f=0;f<F;f++)colptr[f+1]+=colptr[f];
  const rows=new Int32Array(colptr[F]),values=new Float64Array(colptr[F]);
  const cursor=colptr.slice(0,F);
  for(let k=0;k<K;k++) {
    const e=kept[k],l=freeIndex[p.low[e]],h=freeIndex[p.high[e]];
    if(l>=0){const at=cursor[l]++;rows[at]=k;values[at]=-1;}
    if(h>=0){const at=cursor[h]++;rows[at]=k;values[at]=1;}
  }
  for(let f=0;f<F;f++){const at=cursor[f]++;rows[at]=K+f;values[at]=1;}
  const diagonal=Float64Array.from(free,i=>counts[i]);
  const sourceOrder=await projectionTopologicalOrder(p.levels,options),topological=sourceOrder.indices;
  const fullOutOffsets=new Uint32Array(n+1),fullOutEdges=new Uint32Array(E);
  for(let e=0;e<E;e++)fullOutOffsets[p.low[e]+1]++;
  for(let i=0;i<n;i++)fullOutOffsets[i+1]+=fullOutOffsets[i];
  const fullOutCursor=fullOutOffsets.slice(0,n);
  for(let e=0;e<E;e++)fullOutEdges[fullOutCursor[p.low[e]]++]=e;
  const budget=options.memoryBudgetBytes??128*1024*1024;
  if(!Number.isFinite(budget)||budget<2097152||budget>2147483648)throw new Error('OSQP admitted heap must be between 2 MiB and 2 GiB');
  const allocationFailure=(message,cause,details={})=>Object.assign(new Error(message,cause?{cause}:undefined),{code:'MEMORY_ALLOCATION',details:{allocationKind:'wasm',maximumBytes:budget,...details}});
  let wasmMemory;
  try{wasmMemory=new WebAssembly.Memory({initial:32,maximum:Math.floor(budget/65536)});}
  catch(cause){if(!(cause instanceof RangeError))throw cause;throw allocationFailure('Unable to allocate the bounded OSQP heap',cause,{requestedBytes:2097152,boundary:'WebAssembly.Memory'});}
  let module=await createOSQPModule({wasmMemory,locateFile:options.locateFile,
      print:()=>{},printErr:()=>{}});
  if(typeof module._sh_osqp_malloc!=='function')throw new Error('OSQP allocator bridge version differs');
  module._malloc=module._sh_osqp_malloc;
  const pointers=[];
  function alloc(a) {
    const at=module._malloc(a.byteLength);
    if(!at)throw allocationFailure('OSQP admitted heap exhausted',undefined,{requestedBytes:a.byteLength,currentBytes:module.HEAPU8.length,boundary:'malloc-null'});
    pointers.push(at);module.HEAPU8.set(new Uint8Array(a.buffer,a.byteOffset,a.byteLength),at);return at;
  }
  let solver=0,fatal=false;
  let channel=null,pendingYield=null;
  const cooperate=options.cooperate || (()=>new Promise(resolve=>{
    if(!channel){channel=new MessageChannel();channel.port1.onmessage=()=>{const f=pendingYield;pendingYield=null;f?.();};}
    pendingYield=resolve;channel.port2.postMessage(0);
  }));
  let owned={};
  try {
    owned={p:alloc(diagonal),ap:alloc(colptr),ai:alloc(rows),ax:alloc(values),
      q:alloc(new Float64Array(F)),lower:alloc(lower),upper:alloc(upper),
      warmX:alloc(new Float64Array(F)),warmY:alloc(new Float64Array(M))};
  } catch(e){for(const ptr of pointers)module._free(ptr);module=null;wasmMemory=null;throw e;}
  const preparationMs=performance.now()-started;
  function dispose() {
    if(disposed)return;disposed=true;
    if(busy){disposed=false;throw new Error('Cancel and await the active projection before disposing its owner');}
    if(solver&&!fatal)module._sh_osqp_destroy(solver);
    solver=0;
    if(!fatal)for(const ptr of pointers)module._free(ptr);
    pointers.length=0;
    channel?.port1.close();channel?.port2.close();channel=null;module=null;wasmMemory=null;
  }
  const zWork=new Float64Array(n),dualWork=new Float64Array(M),forceWork=new Float64Array(F),upperWork=new Float64Array(n);
  const padding=4*Number.EPSILON;
  let upperEnvelopeReady=false;
  // This descending envelope depends only on the immutable graph, rho and
  // fixed endpoint anchors. Build it at the original first-evaluation point,
  // without adding constructor work or a new cancellation/ownership boundary.
  function prepareUpperEnvelope() {
    upperWork.fill(1);for(let i=0;i<n;i++)if(p.levels[i]===lo)upperWork[i]=0;
    for(let at=n-1;at>=0;at--) {
      const l=topological[at];
      for(let k=fullOutOffsets[l];k<fullOutOffsets[l+1];k++) {
        const e=fullOutEdges[k],h=p.high[e];
        upperWork[l]=Math.min(upperWork[l],upperWork[h]-rho*p.difference[e]-2*padding);
      }
    }
    upperEnvelopeReady=true;
  }
  function evaluate(trial,reference=null) {
    const sx=module._sh_osqp_x(solver),sy=module._sh_osqp_y(solver);
    const x=module.HEAPF64.subarray(sx/8,sx/8+F);
    dualWork.set(module.HEAPF64.subarray(sy/8,sy/8+M));
    zWork.set(baseline);
    for(let f=0;f<F;f++)zWork[free[f]]=Math.max(0,Math.min(1,x[f]));
    let repair=0,repairMaxDelta=0;
    if(options.repair==='blend') {
      for(let e=0;e<E;e++) {
        const l=p.low[e],h=p.high[e],floor=rho*p.difference[e],slack=zWork[h]-zWork[l]-floor;
        if(slack<0){const baseSlack=baseline[h]-baseline[l]-floor;repair=Math.max(repair,-slack/(baseSlack-slack));}
      }
      if(repair>0){repair=Math.min(1,repair*1.0001+1e-12);for(let i=0;i<n;i++){const old=zWork[i];zWork[i]=(1-repair)*old+repair*baseline[i];repairMaxDelta=Math.max(repairMaxDelta,Math.abs(zWork[i]-old));}}
    } else {
      // Descending upper envelopes, then ascending lower propagation on the DAG.
      // Two ulp reserves in the envelope and one in propagation leave room for
      // roundoff while changing only the near-active local constraints.
      if(!upperEnvelopeReady)prepareUpperEnvelope();
      for(let i=0;i<n;i++)zWork[i]=Math.max(0,Math.min(upperWork[i],zWork[i]));
      for(let at=0;at<n;at++) {
        const l=topological[at];
        for(let k=fullOutOffsets[l];k<fullOutOffsets[l+1];k++) {
          const e=fullOutEdges[k],h=p.high[e];
          zWork[h]=Math.max(zWork[h],zWork[l]+rho*p.difference[e]+padding);
        }
      }
      for(let f=0;f<F;f++)repairMaxDelta=Math.max(repairMaxDelta,Math.abs(zWork[free[f]]-x[f]));
      for(let i=0;i<n;i++)if(!Number.isFinite(zWork[i])||zWork[i]<0||zWork[i]>1)throw new Error('DAG feasibility bounds failed');
    }
    let margin=Infinity;
    for(let e=0;e<E;e++)margin=Math.min(margin,zWork[p.high[e]]-zWork[p.low[e]]-rho*p.difference[e]);
    if(margin < -2e-15)throw new Error('OSQP original graph feasibility failed');
    for(let k=0;k<K;k++)dualWork[k]=Math.min(dualWork[k],0);
    forceWork.fill(0);
    for(let f=0;f<F;f++)for(let k=colptr[f];k<colptr[f+1];k++)forceWork[f]+=values[k]*dualWork[rows[k]];
    let primal=0,gapRaw=0,roundingScale=0,minCount=Infinity;
    for(let f=0;f<F;f++) {
      const i=free[f],mass=diagonal[f],error=zWork[i]-trial[i],station=mass*error+forceWork[f];
      primal+=.5*mass*error*error;gapRaw+=.5*station*station/mass;minCount=Math.min(minCount,mass);
      const mu=dualWork[K+f];gapRaw+=mu>=0?mu*(1-zWork[i]):(-mu)*zWork[i];
      roundingScale+=Math.abs(mu)*(1+Math.abs(zWork[i]));
    }
    for(let k=0;k<K;k++) {
      const e=kept[k],l=p.low[e],h=p.high[e],floor=rho*p.difference[e],lambda=-dualWork[k];
      gapRaw+=lambda*Math.max(0,zWork[h]-zWork[l]-floor);
      roundingScale+=lambda*(Math.abs(zWork[l])+Math.abs(zWork[h])+Math.abs(floor));
    }
    const allowance=64*Number.EPSILON*(Number.MIN_VALUE+gapRaw+roundingScale);
    const gap=gapRaw+allowance;
    let maxError=null,rmsError=null;
    if(reference) {
      const ref=component(reference);maxError=0;rmsError=0;
      for(let i=0;i<n;i++){const d=zWork[i]-ref[i];maxError=Math.max(maxError,Math.abs(d));rmsError+=counts[i]*d*d;}
      rmsError=Math.sqrt(rmsError/N);
    }
    return {primal,dual:primal-gapRaw,gap,certificateRMS:Math.sqrt(2*gap/N),certificateMax:Math.sqrt(2*gap/minCount),
      maxError,rmsError,repairFraction:repair,repairMethod:options.repair==='blend'?'blend':'dag',repairMaxDelta,minimumMargin:margin};
  }
  async function solve(t0,tb,solveOptions={}) {
    if(disposed||busy)throw new Error(disposed?'Disposed projection':'Projection already running');
    busy=true;const begin=performance.now();
    try {
      const a=component(t0),b=component(tb),trial=new Float64Array(n),q=new Float64Array(F);
      let same=true;
      for(let i=0;i<n;i++){if(!Number.isFinite(a[i])||!Number.isFinite(b[i]))throw new Error('Invalid target');trial[i]=baseline[i]+b[i]-a[i];if(a[i]!==b[i])same=false;}
      if(same)return {z:baseline.slice(),lambda:options.returnDual===false?null:new Float64Array(E),info:{backend:'cpu-wasm-osqp',iterations:0,identityMicro:true,memoryBytes:module.HEAPU8.length,certificateMax:0,certificateRMS:0,primal:0,gap:0}};
      for(let f=0;f<F;f++)q[f]=-diagonal[f]*trial[free[f]];
      module.HEAPF64.set(q,owned.q/8);
      if(!solver) {
        try {
          solver=module._sh_osqp_create(F,M,values.length,owned.p,owned.ap,owned.ai,owned.ax,
            owned.q,owned.lower,owned.upper,options.eps??1e-11,options.chunkIterations??100,options.polish===false?0:1);
        } catch(cause) {
          fatal=true;
          if(module._sh_osqp_allocator_oom?.())throw allocationFailure('OSQP setup exhausted its bounded native heap',cause,{currentBytes:module.HEAPU8.length,boundary:'osqp-setup-trap',allocatorEvidence:'Allocator failure latch or ENOMEM after per-setup reset'});
          throw cause;
        }
        if(!solver){fatal=true;const code=module._sh_osqp_last_error();
          if(code===-100||code===module._sh_osqp_memory_error_code?.()||module._sh_osqp_allocator_oom?.())throw allocationFailure('OSQP setup allocation failed',undefined,{currentBytes:module.HEAPU8.length,boundary:'osqp-setup-status',nativeStatus:code,allocatorEvidence:module._sh_osqp_allocator_oom?.()?'Allocator failure latch or ENOMEM after per-setup reset':'Explicit OSQP allocation status'});
          throw new Error('OSQP setup failed without allocation evidence: '+code);
        }
        module.HEAPF64.set(Float64Array.from(free,i=>baseline[i]),owned.warmX/8);
        module._sh_osqp_warm_start(solver,owned.warmX,0);
      } else if(module._sh_osqp_update_q(solver,owned.q))throw new Error('OSQP q update failed');
      const initial=solveOptions.initial;
      if(initial?.z) {
        const z=component(initial.z),xf=Float64Array.from(free,i=>z[i]);module.HEAPF64.set(xf,owned.warmX/8);
        let py=0;
        if(initial.lambda) {
          const dual=new Float64Array(M),bt=new Float64Array(n);
          for(let k=0;k<K;k++) {const e=kept[k],lambda=Math.max(0,initial.lambda[e]||0);dual[k]=-lambda;bt[p.low[e]]-=lambda;bt[p.high[e]]+=lambda;}
          for(let f=0;f<F;f++) {
            const i=free[f],mu=counts[i]*(trial[i]-z[i])+bt[i];
            dual[K+f]=z[i]<=0?Math.min(mu,0):z[i]>=1?Math.max(mu,0):0;
          }
          module.HEAPF64.set(dual,owned.warmY/8);py=owned.warmY;
        }
        module._sh_osqp_warm_start(solver,owned.warmX,py);
      }
      let status=7,iterations=0,chunks=0,acceptedByCertificate=false,diagnostics=null;
      const certificateTolerance=solveOptions.certificateTolerance;
      if(certificateTolerance!==undefined && (!Number.isFinite(certificateTolerance)||certificateTolerance<=0))throw new Error('Invalid projection error budget');
      const maximum=solveOptions.maxIterations??options.maxIterations??100000;
      const initialStateEligible=solveNumber>0 && Number.isFinite(certificateTolerance) && (solveOptions.certifyInitialState??options.certifyInitialState??true);
      let initialStateChecked=false,initialStateAccepted=false;
      if(initialStateEligible) {
        // q was updated above from the current target planes. The complete
        // current-domain certificate, not the previous status, is decisive.
        diagnostics=evaluate(trial,solveOptions.reference);initialStateChecked=true;
        if(diagnostics.certificateMax<=certificateTolerance){acceptedByCertificate=true;initialStateAccepted=true;}
      }
      while(!acceptedByCertificate&&iterations<maximum) {
        if(solveOptions.signal?.aborted || solveOptions.shouldCancel?.())throw abortError();
        const chunk=Math.min(options.chunkIterations??100,maximum-iterations);
        try{status=module._sh_osqp_solve(solver,chunk);}
        catch(cause){
          fatal=true;
          if(cause instanceof WebAssembly.RuntimeError&&module._sh_osqp_allocator_oom())throw allocationFailure('OSQP solve exhausted its bounded native heap',cause,{currentBytes:module.HEAPU8.length,boundary:'osqp-solve-trap',iterationsCompleted:iterations,allocatorEvidence:'Current solve allocator failure latch or ENOMEM'});
          throw cause;
        }
        if(status===-module._sh_osqp_memory_error_code() || status!==1&&status!==7&&status!==2&&module._sh_osqp_allocator_oom()){
          fatal=true;
          throw allocationFailure('OSQP solve allocation failed',undefined,{currentBytes:module.HEAPU8.length,boundary:'osqp-solve-status',nativeStatus:status,iterationsCompleted:iterations,allocatorEvidence:module._sh_osqp_allocator_oom()?'Current solve allocator failure latch or ENOMEM':'Explicit OSQP allocation status'});
        }
        iterations+=module._sh_osqp_iterations(solver);chunks++;
        if(status!==1 && status!==7 && status!==2)throw new Error('OSQP failed with status '+status);
        if(certificateTolerance!==undefined) {
          diagnostics=evaluate(trial,solveOptions.reference);
          if(diagnostics.certificateMax<=certificateTolerance){acceptedByCertificate=true;break;}
          if(status===1)throw new Error('OSQP residual tolerance reached but requested maximum-error certificate was not reached');
        }
        if(status===1 && certificateTolerance===undefined)break;
        solveOptions.onProgress?.({iterations,status,memoryBytes:module.HEAPU8.length,...diagnostics});
        await cooperate();
      }
      if(status!==1 && !acceptedByCertificate)throw new Error('OSQP projection unconverged after '+iterations+' iterations');
      diagnostics=evaluate(trial,solveOptions.reference);
      if(certificateTolerance!==undefined && diagnostics.certificateMax>certificateTolerance)throw new Error('Projection error budget not reached');
      const lambdaSource=options.returnDual===false?null:new Float64Array(E);if(lambdaSource)for(let k=0;k<K;k++)lambdaSource[kept[k]]=-dualWork[k];
      solveNumber++;
      return {z:zWork.slice(),lambda:lambdaSource,info:{backend:'cpu-wasm-osqp',iterations,chunks,status,acceptedByCertificate,
        preparationMs,solveMs:performance.now()-begin,originalEdges:E,retainedEdges:K,
        solveNumber,initialStateChecked,initialStateAccepted,returnedDual:options.returnDual!==false,topologicalOrderBackend:sourceOrder.backend,topologicalScratchBytes:sourceOrder.scratchBytes,
        ...diagnostics,
        primalResidual:module._sh_osqp_primal_residual(solver),dualResidual:module._sh_osqp_dual_residual(solver),
        memoryBytes:module.HEAPU8.length,memoryLimitBytes:budget}};
    } finally {busy=false;if(fatal)dispose();}
  }
  return {solve,dispose,get memoryBytes(){return module?.HEAPU8.length||0;},
    get metadata(){return {backend:'cpu-wasm-osqp',preparationMs,originalEdges:E,retainedEdges:K,freeComponents:F,memoryBudgetBytes:budget};}};
}
