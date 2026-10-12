import esbuild from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const entryPoint = path.join(rootDir, 'src', 'workers', 'data-processor.worker.ts');
const publicOutDir = path.join(rootDir, 'public', 'workers');
const publicOutFile = path.join(publicOutDir, 'data-processor.worker.js');
const staticOutDir = path.join(rootDir, 'out', 'workers');
const staticOutFile = path.join(staticOutDir, 'data-processor.worker.js');

if (!fs.existsSync(publicOutDir)) {
  fs.mkdirSync(publicOutDir, { recursive: true });
}

console.log('[Worker Builder] Compiling src/workers/data-processor.worker.ts...');
esbuild.buildSync({
  entryPoints: [entryPoint],
  bundle: true,
  outfile: publicOutFile,
  format: 'iife',
  target: 'es2020',
  minify: false,
});
console.log(`[Worker Builder] Bundled to ${publicOutFile}`);

// If out/ exists, also keep out/workers/ up to date immediately
if (fs.existsSync(path.join(rootDir, 'out'))) {
  if (!fs.existsSync(staticOutDir)) {
    fs.mkdirSync(staticOutDir, { recursive: true });
  }
  fs.copyFileSync(publicOutFile, staticOutFile);
  console.log(`[Worker Builder] Synced to ${staticOutFile}`);
}
