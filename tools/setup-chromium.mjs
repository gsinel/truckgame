/**
 * Rebuilds the local headless-Chromium harness used by tools/probe.mjs and
 * tools/shots.mjs. The sandbox wipes /tmp between sessions, so this extracts the
 * binaries that @sparticuz/chromium already ships (no network access needed).
 *
 *   node tools/setup-chromium.mjs
 *   CHROME_PATH=/tmp/chromium CHROME_LIB_DIR=/tmp/al2023/lib npm run probe
 */
import zlib from 'node:zlib';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const BIN = path.resolve('node_modules/@sparticuz/chromium/bin');
const CHROME = process.env.CHROME_PATH || '/tmp/chromium';
const LIB = process.env.CHROME_LIB_DIR || '/tmp/al2023/lib';
const load = (file) => zlib.brotliDecompressSync(fs.readFileSync(path.join(BIN, file)));
/** Packages ship either a raw file or a tar, depending on the entry. */
const isTar = (buf) => buf.length > 265 && buf.toString('latin1', 257, 262) === 'ustar';
const unpack = (file, dir) => {
  const buf = load(file);
  if (isTar(buf)) execFileSync('tar', ['-xf', '-', '-C', dir], { input: buf });
  return buf;
};

if (!fs.existsSync(BIN)) { console.error('run `npm ci` first: ' + BIN + ' is missing'); process.exit(1); }
fs.mkdirSync(LIB, { recursive: true });
if (!fs.existsSync(CHROME)) {
  const raw = unpack('chromium.br', '/tmp');
  if (!isTar(raw)) { fs.writeFileSync(CHROME, raw); fs.chmodSync(CHROME, 0o755); }
  else {
    const extracted = fs.readdirSync('/tmp').find((f) => f.startsWith('chromium'));
    if (extracted && extracted !== 'chromium') fs.renameSync('/tmp/' + extracted, CHROME);
    fs.chmodSync(CHROME, 0o755);
  }
}
// al2023.tar.br carries its own `lib/` prefix; the SwiftShader and font archives do not.
unpack('al2023.tar.br', path.dirname(LIB));
unpack('swiftshader.tar.br', '/tmp'); // libEGL/libvulkan/vk_swiftshader_icd.json
try { unpack('fonts.tar.br', LIB); } catch { /* optional */ }
console.log('chromium:', CHROME, fs.statSync(CHROME).size, 'bytes');
console.log('libs:', LIB, fs.readdirSync(LIB).length, 'entries');
console.log('swiftshader:', fs.existsSync('/tmp/vk_swiftshader_icd.json') ? '/tmp/vk_swiftshader_icd.json' : 'MISSING');
