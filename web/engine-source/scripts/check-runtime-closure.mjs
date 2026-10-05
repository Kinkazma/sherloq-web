// Literal dependencies only; complete execution of the extracted archive is
// still required for computed URLs and dynamically loaded model/runtime paths.
import {readFile, stat, writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url));
const bytes = await readFile(path.join(root, 'runtime-manifest.json')), manifest = JSON.parse(bytes), files = new Set(manifest.files.map(row => row.file)), missing = [];
for (const file of files) {
  if (!/\.m?js$/.test(file)) continue;
  const text = await readFile(path.join(root, file), 'utf8');
  for (const match of text.matchAll(/(?:from\s*|import\s*\(|new URL\s*\()\s*['"]([^'"]+)['"]/g)) {
    const name = match[1]; if (!name.startsWith('.')) continue;
    const resolved = path.posix.normalize(path.posix.join(path.posix.dirname(file), name));
    try {if ((await stat(path.join(root, resolved))).isFile() && !files.has(resolved)) missing.push({file, dependency: resolved});}
    catch {if (!name.endsWith('/')) missing.push({file, unresolved: resolved});}
  }
}
const proof = {schema: 1, version: manifest.version, status: missing.length ? 'rejected' : 'passed', scope: 'Local literal ESM imports and literal new URL file dependencies. Computed paths need actual extracted-runtime execution; this scan alone does not establish closure.', manifestSha256: createHash('sha256').update(bytes).digest('hex'), runtimeFiles: files.size, missing};
await writeFile(path.join(root, 'docs/runtime-' + manifest.version + '-static-dependencies.json'), JSON.stringify(proof, null, 2) + '\n');
console.log(JSON.stringify(proof)); if (missing.length) process.exitCode = 1;
