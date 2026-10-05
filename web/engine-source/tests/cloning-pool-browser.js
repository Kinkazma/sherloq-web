import {Budget} from '../src/cache.js';
import {EngineError} from '../src/errors.js';
import {CloningGroupPool,cloningGroupWorkerBytes} from '../src/cloning-group-pool.js';
import {cloningNormFunction} from '../src/cloning-math.js';
import {cloningFixture,exactCloning,ensure} from './cloning-reference.js';
export async function cloningPoolBrowserTest(){
  const reference=await(await fetch('/fixtures/cloning/reference.json')).json(),payload=new Uint8Array(await new Response((await fetch('/fixtures/cloning/reference.bin.gz')).body.pipeThrough(new DecompressionStream('gzip'))).arrayBuffer()),read=(file,Type)=>cloningFixture(reference,payload,file,Type);
  const row=reference.cases.find(x=>x.image==='shapes'&&x.mask==='all'&&x.params.matching===35),points=read(row.prefix+'-points.f64',Float64Array),matches=read(row.prefix+'-filtered.f64',Float64Array),expectedLengths=read(row.prefix+'-lengths.u32',Uint32Array),expectedGroups=read(row.prefix+'-groups.u32',Uint32Array),norm=await cloningNormFunction();
  // The generated shapes fixture is 319 x 257; the distance is in source pixels.
  const distance=15/100*257/2,pointCount=points.length/7,near=new Uint8Array(pointCount*pointCount),displacements=new Float64Array(matches.length/3);
  for(let a=0;a<pointCount;a++)for(let b=0;b<pointCount;b++){const d=norm(points[a*7]-points[b*7],points[a*7+1]-points[b*7+1]);near[a*pointCount+b]=d>0&&d<distance?1:0;}
  for(let i=0;i<displacements.length;i++){const a=matches[i*3]*7,b=matches[i*3+1]*7,x=points[a]-points[b],y=points[a+1]-points[b+1];displacements[i]=Math.sqrt(x*x+y*y);}
  const input={matches,displacements,near,pointCount,distance},perWorker=cloningGroupWorkerBytes(input),limit=2*perWorker+2*expectedGroups.byteLength+expectedLengths.byteLength+Math.ceil(expectedLengths.length/16)*64,budget=new Budget(limit),pool=new CloningGroupPool(budget,{maxWorkers:10}),releases=[];
  const account=n=>{const release=budget.reserve(n);releases.push(release);return release;},releaseAll=()=>{for(const release of releases)release();releases.length=0;};
  try{
    const result=await pool.run(input,{account});ensure(result.metrics.cloningGroupWorkers===2,'Resource-bound two-worker plan');exactCloning(result.lengths,expectedLengths,'Native row lengths');exactCloning(result.groups,expectedGroups,'Native ordered group indices');ensure(!budget.retained&&pool.workers.length===0,'Workers and charge released');releaseAll();ensure(!budget.active,'Owned outputs released');
    const controller=new AbortController(),running=pool.run(input,{signal:controller.signal,account}),timer=setTimeout(()=>controller.abort(),5);let failure;
    try{await running;}catch(error){failure=error;}finally{clearTimeout(timer);releaseAll();}ensure(failure?.code==='CANCELLED','Active group cancellation');ensure(!budget.retained&&!budget.active&&pool.workers.length===0,'Cancellation cleanup');
    let allocations=0;const failed=await pool.run(input,{account:n=>{if(++allocations===3)throw new EngineError('MEMORY_LIMIT','Injected global resource pressure');return account(n);}});releaseAll();ensure(!failed.groups&&failed.metrics.cloningGroupScheduling.retry?.code==='MEMORY_LIMIT','Explicit serial retry after useful resource failure');ensure(!budget.active&&!budget.retained&&pool.workers.length===0,'Resource failure cleanup');
    const small=new Budget(perWorker),serial=new CloningGroupPool(small,{maxWorkers:10});try{const plan=await serial.run(input,{account:n=>small.reserve(n)});ensure(!plan.groups&&plan.metrics.cloningGroupWorkers===1&&!small.active&&!small.retained,'Serial plan below two-worker budget');}finally{serial.dispose();}
    return {status:'passed',nativeGroupIndices:expectedGroups.length,resourceReducedWorkers:2,peakAccountedBytes:budget.peak,budgetBytes:limit,cancellation:'Active workers terminated; all charges released',resourceFailure:'Useful worker outputs release before explicit serial retry',tooSmallPool:'serial without worker construction',preflightExecutions:0};
  }finally{pool.dispose();releaseAll();}
}
