// Native MPS448/896 GPU routes and high-budget1344 qualified on the full-source protocol.
const minimum896BudgetBytes=2*1024**3,minimum1344BudgetBytes=18*1024**3,minimum1792BudgetBytes=24*1024**3;
const base=Object.freeze({cpuSides:Object.freeze([448]),gpuSides:Object.freeze([448])});
const extended=Object.freeze({cpuSides:base.cpuSides,gpuSides:Object.freeze([448,896])});
const high=Object.freeze({cpuSides:base.cpuSides,gpuSides:Object.freeze([448,896,1344])});
// Receipt candidate: require complete1792 high-budget Native/raw/mask protocol GREEN before applying.
const high1792=Object.freeze({cpuSides:base.cpuSides,gpuSides:Object.freeze([448,896,1344,1792])});
/** Read the current owner budget without a device probe or user-agent rule.
 *896 uses bounded lossless transport below8GiB and the existing dense path
 *from8GiB. Resource reservations still use the actual shared owner and ACKs.
 *1344 keeps its current qualified high-budget route from18GiB. The1792
 *candidate uses the24GiB study floor; lower budgets remain unqualified.
 *These floors do not replace real per-allocation admission.
 *CPU numerical admission remains448.
 */
export function d2prlUsefulAdmission(budget){
 const limit=budget?.limit;
 if(Number.isSafeInteger(limit)&&limit>=minimum1792BudgetBytes)return high1792;
 if(Number.isSafeInteger(limit)&&limit>=minimum1344BudgetBytes)return high;
 return Number.isSafeInteger(limit)&&limit>=minimum896BudgetBytes?extended:base;
}
