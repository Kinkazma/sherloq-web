import {readFile,writeFile} from 'node:fs/promises';import {createHash} from 'node:crypto';
const [file,expectedText,out]=process.argv.slice(2),expected=Number(expectedText);if(!file||!Number.isSafeInteger(expected)||expected<=0||!out)throw Error('Usage: verify-fixed-wasm-memory.mjs FILE BYTES PROOF');
const bytes=await readFile(file);if(bytes.subarray(0,8).toString('hex')!=='0061736d01000000')throw Error('Invalid WASM header');let at=8;
function leb(){let value=0,bits=0,byte;do{if(at>=bytes.length||bits>35)throw Error('Invalid LEB');byte=bytes[at++];value+=(byte&127)*2**bits;bits+=7;}while(byte&128);return value;}
let memories;
while(at<bytes.length){const id=bytes[at++],length=leb(),end=at+length;if(end>bytes.length)throw Error('Invalid section');if(id===5){const count=leb();memories=[];for(let i=0;i<count;i++){const flags=leb(),minimumPages=leb(),maximumPages=flags&1?leb():null;memories.push({flags,minimumPages,maximumPages});}}at=end;}
if(memories?.length!==1||memories[0].flags!==1||memories[0].minimumPages*65536!==expected||memories[0].maximumPages*65536!==expected)throw Error('WASM memory is not the requested fixed-size non-shared memory');const proof={schema:1,status:'passed',file,sha256:createHash('sha256').update(bytes).digest('hex'),expectedBytes:expected,memories};await writeFile(out,JSON.stringify(proof,null,2)+'\n');console.log(JSON.stringify(proof));
