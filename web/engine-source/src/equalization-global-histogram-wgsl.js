// Histogram100 RGB8 packed kernels; identical to the qualified private batched prototype.
const PARAMS = `struct Parameters {
  width:u32, height:u32, pixels:u32, histogramGroups:u32,
  hasMask:u32, applyGroups:u32, outputWords:u32, unused:u32
};`;
const SOURCE = `
fn sourceByte(index:u32) -> u32 {
  return (sourceRGB[index >> 2u] >> ((index & 3u) * 8u)) & 255u;
}
fn included(pixel:u32) -> bool {
  if (params.hasMask == 0u) { return true; }
  return ((membership[pixel >> 2u] >> ((pixel & 3u) * 8u)) & 255u) != 0u;
}`;

export const HISTOGRAM_WGSL = `${PARAMS}
@group(0) @binding(0) var<storage,read> sourceRGB:array<u32>;
@group(0) @binding(1) var<storage,read> membership:array<u32>;
@group(0) @binding(2) var<storage,read_write> partials:array<u32>;
@group(0) @binding(3) var<uniform> params:Parameters;
var<workgroup> bins:array<atomic<u32>,256>;
${SOURCE}
@compute @workgroup_size(256)
fn main(@builtin(local_invocation_index) local:u32,
        @builtin(workgroup_id) group:vec3<u32>) {
  atomicStore(&bins[local],0u);
  workgroupBarrier();
  let step=params.histogramGroups*256u;
  var pixel=group.x*256u+local;
  loop {
    if (pixel >= params.pixels) { break; }
    if (included(pixel)) {
      let at=pixel*3u;
      let value=max(sourceByte(at),max(sourceByte(at+1u),sourceByte(at+2u)));
      atomicAdd(&bins[value],1u);
    }
    if (step >= params.pixels-pixel) { break; }
    pixel+=step;
  }
  workgroupBarrier();
  partials[group.x*256u+local]=atomicLoad(&bins[local]);
}`;

export const REDUCE_WGSL = `${PARAMS}
@group(0) @binding(0) var<storage,read> partials:array<u32>;
@group(0) @binding(1) var<storage,read_write> histogram:array<u32>;
@group(0) @binding(2) var<uniform> params:Parameters;
@compute @workgroup_size(256)
fn main(@builtin(local_invocation_index) bin:u32) {
  var total=0u;
  for (var group=0u;group<params.histogramGroups;group++) {
    total+=partials[group*256u+bin];
  }
  histogram[bin]=total;
}`;

// Four RGB pixels occupy three complete u32 words. Each invocation owns all
// three words, so no byte-wise atomics or inter-pixel output race is required.
export const APPLY_WGSL = `${PARAMS}
@group(0) @binding(0) var<storage,read> sourceRGB:array<u32>;
@group(0) @binding(1) var<storage,read> membership:array<u32>;
@group(0) @binding(2) var<storage,read> ratios:array<u32>;
@group(0) @binding(3) var<storage,read_write> resultRGB:array<u32>;
@group(0) @binding(4) var<uniform> params:Parameters;
${SOURCE}
fn mappedByte(value:u32,channel:u32) -> u32 {
  let index=value*256u+channel;
  return (ratios[index >> 2u] >> ((index & 3u)*8u)) & 255u;
}
@compute @workgroup_size(256)
fn main(@builtin(global_invocation_id) gid:vec3<u32>) {
  let tiles=params.pixels/4u+select(0u,1u,params.pixels%4u!=0u);
  let step=params.applyGroups*256u;
  var tile=gid.x;
  loop {
    if (tile>=tiles) { break; }
    var packed=array<u32,3>(0u,0u,0u);
    for (var k=0u;k<4u;k++) {
      let pixel=tile*4u+k;
      if (pixel<params.pixels) {
        let at=pixel*3u;
        var rgb=array<u32,3>(sourceByte(at),sourceByte(at+1u),sourceByte(at+2u));
        let value=max(rgb[0],max(rgb[1],rgb[2]));
        let admit=included(pixel);
        for (var channel=0u;channel<3u;channel++) {
          let index=k*3u+channel;
          let byte=select(rgb[channel],mappedByte(value,rgb[channel]),admit);
          packed[index >> 2u]|=byte << ((index & 3u)*8u);
        }
      }
    }
    for (var word=0u;word<3u;word++) {
      let index=tile*3u+word;
      if (index<params.outputWords) { resultRGB[index]=packed[word]; }
    }
    if (step>=tiles-tile) { break; }
    tile+=step;
  }
}`;

