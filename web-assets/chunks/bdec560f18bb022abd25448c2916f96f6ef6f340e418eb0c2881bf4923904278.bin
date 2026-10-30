import {requireValue} from '../../src/errors.js';
// An explicit capability of a factory object, never inferred from its name,
// properties, returned RNG or browser. Weak keys live with their owning model.
const residentFactories=new WeakMap();
export function declareResidentRandomFactory(factory,residentFactory){
 requireValue(typeof factory==='function'&&typeof residentFactory==='function'&&!residentFactories.has(factory),'One explicit resident source factory capability');
 residentFactories.set(factory,residentFactory);return factory;
}
export function instantiateRandomForConsumer(factory,state,{resident=false}={}){
 requireValue(typeof factory==='function','Original random factory required');
 const selected=resident?residentFactories.get(factory)??factory:factory;
 // Preserve third-party argument count, receiver, return/Promise identity and
// thrown primary. No wrapper RNG, extra argument, probe, or GPU context is made.
 return selected(state);
}
