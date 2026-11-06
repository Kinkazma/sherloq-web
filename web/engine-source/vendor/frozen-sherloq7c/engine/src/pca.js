import {parameters} from './pixel-utils.js';import {cvPcaModel,cvPcaView} from './opencv.js';
const modes=['distance','project','crossprod'];
export const pcaParams=(p={})=>parameters(p,{component:0,mode:'distance',invert:false,equalize:false},{component:[0,2]},{mode:modes},['invert','equalize']);
export async function pcaData(image,p,hooks){const basis=await cvPcaModel(image,hooks);return {pcaSource:image,basis,data:{channelOrder:'BGR',mean:basis.slice(0,3),eigenvectors:basis.slice(3,12),eigenvalues:basis.slice(12,15)},semantics:'Native float64 PCA basis reused across views, centering and normalization; data vectors use BGR component order.'};}
export async function pcaView(result,p,hooks){result.pixels=await cvPcaView(result.pcaSource,result.basis,[p.component,modes.indexOf(p.mode),+p.invert,+p.equalize],hooks);delete result.pcaSource;delete result.basis;return result;}
