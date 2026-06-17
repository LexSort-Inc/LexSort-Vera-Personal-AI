#!/usr/bin/env node
/**
 * sign-module.js — Signs a VERA module directory with Ed25519.
 *
 * Usage:
 *   node scripts/sign-module.js <module-dir>
 *
 * Requirements:
 *   MODULE_SIGNING_PRIVATE_KEY env var — 128-char hex (32-byte private seed + 32-byte public key)
 *
 * What it does:
 *   1. Collects all files in <module-dir>/dist/ + manifest.json (sorted, deterministic)
 *   2. SHA-256 hashes their contents in order
 *   3. Signs the hash with Ed25519
 *   4. Writes <module-dir>/dist/signature.sig (64 raw bytes)
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const moduleDir = process.argv[2];
if (!moduleDir) {
  console.error('Usage: node sign-module.js <module-dir>');
  process.exit(1);
}

const privateKeyHex = process.env.MODULE_SIGNING_PRIVATE_KEY;
if (!privateKeyHex || privateKeyHex.length !== 128) {
  console.error('Error: MODULE_SIGNING_PRIVATE_KEY env var must be a 128-char hex string (32-byte seed + 32-byte public key).');
  console.error('Generate one with: node -e "const c=require(crypto); const {privateKey,publicKey}=c.generateKeyPairSync(ed25519); const s=privateKey.export({type:pkcs8,format:der}).slice(-32); const p=publicKey.export({type:spki,format:der}).slice(-32); console.log(Buffer.concat([s,p]).toString(hex))"');
  process.exit(1);
}

// First 32 bytes are the private key seed, last 32 are the public key (64 bytes total = 128 hex chars)
const keyBytes = Buffer.from(privateKeyHex, 'hex');
const seed = keyBytes.slice(0, 32); // Ed25519 seed (32 bytes)

// Collect files to sign: dist/* + manifest.json
const distDir = path.join(moduleDir, 'dist');
const manifestPath = path.join(moduleDir, 'manifest.json');

if (!fs.existsSync(distDir)) {
  console.error(`Error: dist/ directory not found in ${moduleDir}. Run npm run build first.`);
  process.exit(1);
}

function collectFiles(dir, baseDir) {
  const results = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.name === 'signature.sig') continue; // Skip existing sig
    if (entry.isDirectory()) {
      results.push(...collectFiles(fullPath, baseDir));
    } else {
      results.push(fullPath);
    }
  }
  return results;
}

const filesToSign = [
  manifestPath,
  ...collectFiles(distDir, distDir),
].sort((a, b) => path.basename(a).localeCompare(path.basename(b))); // Sort by filename only — must match Rust verifier's sort-by-ZIP-entry-name

console.log(`Signing ${filesToSign.length} files:`);
filesToSign.forEach(f => console.log(`  ${path.relative(moduleDir, f)}`));

// Hash all file contents
const hash = crypto.createHash('sha256');
for (const filePath of filesToSign) {
  const content = fs.readFileSync(filePath);
  hash.update(content);
}
const digest = hash.digest();

// Sign with Ed25519
const privateKey = crypto.createPrivateKey({
  key: Buffer.concat([
    Buffer.from('302e020100300506032b657004220420', 'hex'), // DER header for Ed25519 private key
    seed,
  ]),
  format: 'der',
  type: 'pkcs8',
});

const signature = crypto.sign(null, digest, privateKey);

// Write signature.sig to dist/
const sigPath = path.join(distDir, 'signature.sig');
fs.writeFileSync(sigPath, signature);

console.log(`\n✅ Signature written to: ${sigPath}`);
console.log(`   Signature length: ${signature.length} bytes`);
console.log(`   Files signed: ${filesToSign.length}`);
