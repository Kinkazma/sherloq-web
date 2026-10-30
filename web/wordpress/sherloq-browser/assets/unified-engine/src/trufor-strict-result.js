import "../../runtime-context.js?v=0.30.0";
import{requireValue}from'./errors.js';
const contexts=new WeakMap();
/** The M2 host may wrap the result to extend provenance. The original data
 * envelope survives that wrapper; internal loans remain private to this map. */
export function bindTruforStrictResult(result,context){contexts.set(result.data,context);}
export function truforStrictResultContext(result){const c=contexts.get(result?.data);requireValue(c&&!c.released(),'Strict TruFor result is retired.');return c;}
