import {requireValue} from './errors.js';
import {roundEven} from './pixel-utils.js';

// Candidate adjustment-domain adapter only. Applying the sRGB transfer curve
// independently to linear channels does NOT convert RGB primaries: in
// particular, ProPhoto-D65 remains ProPhoto-D65, not sRGB. The producer keeps
// the exact input colour/profile metadata and applies its display conversion
// only after this adapter has returned to linear RGB16.
export const ADJUST_PERCEPTUAL_CURVE_POLICY='linear-rgb16/srgb-channel-curve/1';
export const ADJUST_PERCEPTUAL_CURVE_ENTRIES=65536;
const MAXIMUM=65535,TABLE_BYTES=ADJUST_PERCEPTUAL_CURVE_ENTRIES*Uint16Array.BYTES_PER_ELEMENT;

function flag(value,name){requireValue(typeof value==='boolean','Invalid adjustment curve '+name+'.');}
function table(value,name){requireValue(value instanceof Uint16Array&&value.length===ADJUST_PERCEPTUAL_CURVE_ENTRIES,'Adjustment curve '+name+' must be a caller-financed Uint16Array of 65536 entries.');return value;}
function overlaps(a,b){return a.buffer===b.buffer&&a.byteOffset<b.byteOffset+b.byteLength&&b.byteOffset<a.byteOffset+a.byteLength;}
function sameExtent(a,b){return a.buffer===b.buffer&&a.byteOffset===b.byteOffset&&a.byteLength===b.byteLength;}
function quantize(value){return Math.max(0,Math.min(MAXIMUM,roundEven(value*MAXIMUM)));}

/** Validate the CURRENT working samples, never a display view or sensor data.
 * Accepts the RGB16 surface descriptor and native16Descriptor capability form.
 * Only an explicit linear transfer (including CICP transfer 8) is admitted;
 * source/absent transfers, sRGB, gamma, PQ and HLG are not inferred or decoded.
 * An embedded ICC profile alone does not establish this contract. This method
 * reads but never rewrites primaries, profile bytes, range or transfer metadata.
 */
export function requireAdjustPerceptualLinearRgb16(descriptor){
 const d=descriptor,color=d?.color,channels=d?.channels;
 const rgbChannels=channels===3&&(d.channelOrder===undefined||d.channelOrder==='RGB')||Array.isArray(channels)&&channels.length===3&&channels[0]==='R'&&channels[1]==='G'&&channels[2]==='B';
 requireValue(d?.format==='rgb16'&&d.depth===16&&rgbChannels&&(d.space===undefined||d.space==='RGB'),'The adjustment curve requires an explicit RGB16 working domain.');
 requireValue(d.range?.length===2&&d.range[0]===0&&d.range[1]===MAXIMUM,'The adjustment curve requires normalized unsigned RGB16 codes from 0 to 65535.');
 requireValue(color?.model==='RGB'&&(color.transfer===8||typeof color.transfer==='string'&&color.transfer.toLowerCase()==='linear'),'The adjustment curve requires declared linear RGB; undeclared, nonlinear, PQ and HLG transfers are not admitted.');
 return descriptor;
}

/** The producer resolves identity from its fully validated complete preset,
 * including spatial and shared-equalization controls, BEFORE admitting tables.
 * Identity must bypass both curves and every lookup: decode[encode[x]] is not
 * generally x after Uint16 quantization. The adapter must never change a neutral
 * preset merely to enter and leave its temporary adjustment domain.
 */
export function adjustPerceptualCurvePlan({identity=false,compose=false}={}){
 flag(identity,'identity');flag(compose,'composition');
 const encodeBytes=identity?0:TABLE_BYTES,decodeBytes=identity?0:TABLE_BYTES,compositionBytes=!identity&&compose?TABLE_BYTES:0;
 return{known:true,enabled:!identity,identity,depth:16,bins:ADJUST_PERCEPTUAL_CURVE_ENTRIES,maximum:MAXIMUM,encodeBytes,decodeBytes,compositionBytes,residentBytes:encodeBytes+decodeBytes+compositionBytes,scratchBytes:0,outputStorageBytes:0,policy:ADJUST_PERCEPTUAL_CURVE_POLICY};
}

/** No large allocation is performed here; both exact-size destinations have
 * already been admitted and allocated by the producer. Encode each incoming
 * linear word BEFORE the HSV/LUT adjustment pipeline and decode AFTER all
 * corrections. All intermediate channel words remain Uint16; no RGB8 view is
 * involved. Ordinary JS Number arithmetic evaluates the normalized curve and
 * roundEven performs the only quantization at each table boundary.
 *
 * With identity:true destinations are ignored and never written. The returned
 * bypass flag requires the producer to preserve the original samples directly.
 */
export function adjustPerceptualCurveTables({encodeTarget,decodeTarget,identity=false}={}){
 flag(identity,'identity');
 if(identity)return{encode:null,decode:null,bypass:true,policy:ADJUST_PERCEPTUAL_CURVE_POLICY};
 const encode=table(encodeTarget,'encode destination'),decode=table(decodeTarget,'decode destination');
 requireValue(!overlaps(encode,decode),'Adjustment encode and decode destinations must not overlap.');
 for(let code=0;code<ADJUST_PERCEPTUAL_CURVE_ENTRIES;code++){
  const value=code/MAXIMUM;
  encode[code]=quantize(value<=0.0031308?12.92*value:1.055*Math.pow(value,1/2.4)-0.055);
  decode[code]=quantize(value<=0.04045?value/12.92:Math.pow((value+0.055)/1.055,2.4));
 }
 return{encode,decode,bypass:false,policy:ADJUST_PERCEPTUAL_CURVE_POLICY};
}

/** Compose only when toneTable is the FINAL point correction in the temporary
 * curve domain: output[i] = inverseTable[toneTable[i]]. A later HSV/equalizer,
 * threshold or inversion still belongs before the inverse, so it forbids this
 * fusion at an earlier stage. This is not toneTable[inverseTable[i]].
 *
 * The caller finances target. Reusing toneTable's exact extent is safe and
 * avoids a third table; shifted overlap and writes into inverseTable are
 * rejected before mutation. No source samples or profile metadata are changed.
 */
export function composeAdjustPerceptualInverse(toneTable,inverseTable,{target}={}){
 const tone=table(toneTable,'tone input'),inverse=table(inverseTable,'inverse input'),out=table(target,'composition destination');
 requireValue(!overlaps(out,inverse),'Adjustment composition must not mutate its inverse table.');
 requireValue(!overlaps(out,tone)||sameExtent(out,tone),'Shifted adjustment tone overlap requires another destination.');
 for(let code=0;code<ADJUST_PERCEPTUAL_CURVE_ENTRIES;code++)out[code]=inverse[tone[code]];
 return out;
}
