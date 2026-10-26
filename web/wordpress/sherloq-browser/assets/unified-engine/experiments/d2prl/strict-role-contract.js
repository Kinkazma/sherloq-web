import {D2PRL_FRAGMENT_ROLE_GRAPHS} from '../../src/d2prl-fragment-role-graph.js';
import {D2PRL_FRAGMENT_ROLE_ROUTING_GRAPHS} from '../../src/d2prl-fragment-role-routing-graph.js';
import {requireValue} from '../../src/errors.js';
export function strictRoleContract(part){
 const simple=Object.hasOwn(D2PRL_FRAGMENT_ROLE_GRAPHS,part)?D2PRL_FRAGMENT_ROLE_GRAPHS[part]:null,c=simple?{inputs:[{name:simple.input,shape:simple.inputShape}],outputs:[{name:simple.output,shape:simple.outputShape}]}:Object.hasOwn(D2PRL_FRAGMENT_ROLE_ROUTING_GRAPHS,part)?D2PRL_FRAGMENT_ROLE_ROUTING_GRAPHS[part]:null;
 requireValue(c,'An exact pinned native role stage is required.');return c;
}
export function validateStrictRoleFeeds(part,feeds){const c=strictRoleContract(part);requireValue(feeds&&Object.keys(feeds).length===c.inputs.length&&c.inputs.every(p=>feeds[p.name] instanceof Float32Array&&feeds[p.name].length===p.shape.reduce((n,v)=>n*v,1)),'Strict role feeds differ from their original tensor boundary.');return c;}
