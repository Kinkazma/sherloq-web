// Public Winograd F(2,3): U=GgG^T, V=B^TdB, Y=A^T(sum_ci U*V)A.
// The fixed f32 parentheses below preserve the independent Native MPS witness.
// fma(1,a,b) states each same f32 addition explicitly, preventing contraction
// into a different addition tree. No coefficient or reference tensor is used.
// G/B/A are the public matrices (Lavin & Gray, CVPR2016, equations7/8).
const B=[[[0,1],[2,-1]],[[1,1],[2,1]],[[1,-1],[2,1]],[[1,1],[3,-1]]];
// Four signed leaves are ordered by row then column.  The first transformed
// row has a distinct Native f32 association; all other rows use two pairs.
const INPUT_TREES=[
 [0,[1,[2,3]]],[0,[1,[2,3]]],[[0,[2,3]],1],[0,[1,[2,3]]],
 [[0,1],[2,3]],[[0,1],[2,3]],[[0,1],[2,3]],[[0,1],[2,3]],
 [[0,1],[2,3]],[[0,1],[2,3]],[[0,1],[2,3]],[[0,1],[2,3]],
 [[0,1],[2,3]],[[0,1],[2,3]],[[0,1],[2,3]],[[0,1],[2,3]]
];
const A=[[1,1,1,0],[0,1,-1,-1]];
const INVERSE_TREES=[
 [0,[[1,[4,7]],[[2,[5,8]],[3,6]]]],
 [[0,[3,6]],[[1,[4,7]],[2,[5,8]]]],
 [0,[[1,[4,7]],[[2,[5,8]],[3,6]]]],
 [[0,[3,6]],[[[1,[4,7]],2],[5,8]]]
];
const expression=(tree,leaves)=>Number.isInteger(tree)?leaves[tree]:`fma(1.0,${expression(tree[0],leaves)},${expression(tree[1],leaves)})`;
const signed=(name,sign)=>sign===1?name:`(-${name})`;

export function mpsCnn3WinogradShader(){
 const input=[];
 for(let y=0;y<4;y++)for(let x=0;x<4;x++){
  const leaves=[];for(const[i,sy]of B[y])for(const[j,sx]of B[x])leaves.push(signed(`d${i*4+j}`,sy*sx));
  input.push(`let v${y*4+x}=${expression(INPUT_TREES[y*4+x],leaves)};`);
 }
 const inverse=[];
 for(let y=0;y<2;y++)for(let x=0;x<2;x++){
  const leaves=[];for(let i=0;i<4;i++)for(let j=0;j<4;j++)if(A[y][i]*A[x][j])leaves.push(signed(`m${i*4+j}`,A[y][i]*A[x][j]));
  inverse.push(`store(c,y+${y}u,x+${x}u,${expression(INVERSE_TREES[y*2+x],leaves)});`);
 }
 const filter=[];
 for(let row=0;row<3;row++){
  filter.push(`let g${row}=vec3<f32>(weights[base+${row*3}u],weights[base+${row*3+1}u],weights[base+${row*3+2}u]);`);
  filter.push(`let outer${row}=fma(1.0,g${row}.x,g${row}.z);let t${row}=vec4<f32>(g${row}.x,fma(0.5,fma(1.0,outer${row},g${row}.y),0.0),fma(0.5,fma(1.0,outer${row},-g${row}.y),0.0),g${row}.z);`);
 }
 for(let col=0;col<4;col++){
  const z='xyzw'[col];
  filter.push(`let outerG${col}=fma(1.0,t0.${z},t2.${z});let u${col}=t0.${z};let u${4+col}=fma(0.5,fma(1.0,outerG${col},t1.${z}),0.0);let u${8+col}=fma(0.5,fma(1.0,outerG${col},-t1.${z}),0.0);let u${12+col}=t2.${z};`);
 }
 return String.raw`
struct Shape{ih:u32,iw:u32,oh:u32,ow:u32,oc:u32,pad:u32,count:u32,reserved:u32,ranges:u32,stride:u32,groupOc:u32,firstProduct:u32,tailStart:u32,pad0:u32,pad1:u32,pad2:u32};
@group(0) @binding(0) var<storage,read> input:array<f32>;
@group(0) @binding(1) var<storage,read> weights:array<f32>;
@group(0) @binding(2) var<storage,read> bias:array<f32>;
@group(0) @binding(3) var<storage,read_write> output:array<f32>;
@group(0) @binding(4) var<uniform> shape:Shape;
@group(0) @binding(5) var<storage,read> bias_domains:array<vec2<u32>>;
fn readInput(ic:u32,y:u32,x:u32)->f32{
 if(y>=shape.ih||x>=shape.iw){return 0.0;}
 return input[(ic*shape.ih+y)*shape.iw+x];
}
fn store(c:u32,y:u32,x:u32,value:f32){
 if(y>=shape.oh||x>=shape.ow){return;}
 let p=y*shape.ow+x;
 // MPS admission supplies the complete existing bias-after domain.  Keep the
 // binding in the shared layout and use exactly the original separate add.
 if(shape.ranges>0u&&p>=bias_domains[0].x&&p<bias_domains[0].y){
  output[c*shape.oh*shape.ow+p]=fma(1.0,value,bias[c]);
 }
}
@compute @workgroup_size(64) fn main(@builtin(global_invocation_id) gid:vec3<u32>){
 let index=gid.x+gid.y*shape.reserved;
 let tilesX=(shape.ow+1u)/2u;let tilesY=(shape.oh+1u)/2u;let tiles=tilesX*tilesY;
 if(index>=shape.oc*tiles){return;}
 let c=index/tiles;let tile=index%tiles;let y=(tile/tilesX)*2u;let x=(tile%tilesX)*2u;
 ${Array.from({length:16},(_,i)=>`var m${i}=0.0;`).join('\n')}
 for(var ic=0u;ic<64u;ic=ic+1u){
  ${Array.from({length:16},(_,i)=>`let d${i}=readInput(ic,y+${Math.floor(i/4)}u,x+${i%4}u);`).join('\n')}
  ${input.join('\n')}
  let base=(c*64u+ic)*9u;
  ${filter.join('\n')}
  ${Array.from({length:16},(_,i)=>`m${i}=fma(v${i},u${i},m${i});`).join('\n')}
 }
 ${inverse.join('\n')}
}`;
}
