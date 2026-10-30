import {JPEG_WGSL} from './jpeg-source.mjs';
// Same integer graph. The added side output observes quantization before IDCT;
// it never changes a work value or an operator in the reconstruction.
export function jpegArchiveShader(){
 const marker=' for(var x=0u;x<8u;x++){var v:array<i32,8>;for(var k=0u;k<8u;k++){v[k]=work[k*8u+x]*i32(quant',at=JPEG_WGSL.indexOf(marker);if(at<0)throw Error('Native JPEG IDCT graph boundary differs.');
 let source=JPEG_WGSL.slice(0,at)+' for(var k=0u;k<32u;k++){coefficientOutput[block*32u+k]=(bitcast<u32>(work[k*2u])&65535u)|((bitcast<u32>(work[k*2u+1u])&65535u)<<16u);}\n'+JPEG_WGSL.slice(at);
 const a=JPEG_WGSL.indexOf('fn renderPixel('),b=JPEG_WGSL.indexOf('var rr=lookup',a);if(a<0||b<a)throw Error('Native JPEG RGB graph boundary differs.');
 const raw=JPEG_WGSL.slice(a,b).replace('fn renderPixel(at:u32)->vec2u','fn recompressedPixel(at:u32)->u32').replace('return vec2u(0u);','return 0u;')+'return raw;}\n';
 return source+'\n@group(0) @binding(8) var<storage,read_write> coefficientOutput:array<u32>;\n'+raw+`@compute @workgroup_size(64) fn recompressed(@builtin(global_invocation_id) id:vec3<u32>){let group=id.x+id.y*p.renderGroupsX*64u;let at=group*4u;if(at>=p.width*p.height){return;}let raw=packFour(vec4u(recompressedPixel(at),recompressedPixel(at+1u),recompressedPixel(at+2u),recompressedPixel(at+3u)));let words=(p.width*p.height*3u+3u)/4u;for(var k=0u;k<3u;k++){if(group*3u+k<words){rawOutput[group*3u+k]=raw[k];}}}\n`;
}
