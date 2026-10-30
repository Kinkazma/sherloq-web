import "../../runtime-context.js?v=0.30.0";
import {requireValue} from './errors.js';
const f=Math.fround,cosines=[1,0,-1,0,1,0,-1,0],sines=[0,1,0,-1,0,1,0,-1];
const sum8=a=>f(f(f(a[0]+a[1])+f(a[2]+a[3]))+f(f(a[4]+a[5])+f(a[6]+a[7])));
// Read-only version of the native compact SIFT diversity predicate, applied to
// its already normalized/canonical reconstructed vectors. No second rotation,
// altered descriptor or approximation enters the shared PM bank publication.
export function filterDenseSiftDiversity(mask,first,second=first){
 requireValue(mask instanceof Uint8Array&&first instanceof Float32Array&&second instanceof Float32Array&&first.length===mask.length*128&&second.length===first.length,'Invalid SIFT diversity bank');
 const hist=new Float32Array(8),cosine=new Float32Array(8),sine=new Float32Array(8);
 const diverse=(values,start)=>{hist.fill(0);for(let cell=0;cell<16;cell++)for(let bin=0;bin<8;bin++)hist[bin]=f(hist[bin]+values[start+cell*8+bin]);for(let bin=0;bin<8;bin++){cosine[bin]=f(hist[bin]*cosines[bin]);sine[bin]=f(hist[bin]*sines[bin]);}const total=sum8(hist),c=sum8(cosine),s=sum8(sine),anisotropy=f(Math.sqrt(f(f(c*c)+f(s*s))));return total>0&&f(total-anisotropy)>=f(f(.1)*f(total+anisotropy));};
 for(let i=0;i<mask.length;i++)if(mask[i]&&(!diverse(first,i*128)||second!==first&&!diverse(second,i*128)))mask[i]=0;
 return mask;
}
