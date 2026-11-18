import "../../runtime-context.js?v=0.33.3";
import {parameters} from './pixel-utils.js';import {cvPcaModel,cvPcaView} from './opencv.js';
import {createPcaCloudSample} from './pca-cloud.js';
const modes=['distance','project','crossprod'];
export const pcaParams=(p={})=>parameters(p,{component:0,mode:'distance',invert:false,equalize:false},{component:[0,2]},{mode:modes},['invert','equalize']);
export async function pcaData(image,p,hooks){const basis=await cvPcaModel(image,hooks),sample=createPcaCloudSample(image.width*image.height);sample.add(image.data,0);return {pcaSource:image,basis,data:{channelOrder:'BGR',mean:basis.slice(0,3),eigenvectors:basis.slice(3,12),eigenvalues:basis.slice(12,15),cloud:sample.data},semantics:'Native float64 PCA basis reused across views, centering and normalization; data vectors use BGR component order. Cloud is a bounded presentation sample, not the PCA population.'};}
export async function pcaView(result,p,hooks){result.pixels=await cvPcaView(result.pcaSource,result.basis,[p.component,modes.indexOf(p.mode),+p.invert,+p.equalize],hooks);delete result.pcaSource;delete result.basis;return result;}
