import {requireValue} from './errors.js';
const owners=new WeakMap();
export function bindRitaStrictResult(result,owner){owners.set(result.data,owner);}
export function ritaStrictResultContext(result){const owner=owners.get(result?.data);requireValue(owner&&!owner.closed(),'Native RITA context result is retired.');return owner;}
