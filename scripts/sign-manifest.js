#!/usr/bin/env node
/**
 * sign-manifest.js — Signs both website/index.json and website/modules/index.json with Ed25519.
 *
 * Requirements:
 *   MODULE_SIGNING_PRIVATE_KEY env var — 128-char hex (32-byte private seed + 32-byte public key)
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const repoRoot = path.join(__dirname, '..');

// Load environment variables from .env.local if present
const envLocalPath = path.join(repoRoot, '.env.local');
if (fs.existsSync(envLocalPath)) {
  const envLocal = fs.readFileSync(envLocalPath, 'utf8');
  const match = envLocal.match(/MODULE_SIGNING_PRIVATE_KEY\s*=\s*([a-fA-F0-9]{128})/);
  if (match) {
    process.env.MODULE_SIGNING_PRIVATE_KEY = match[1];
  }
}

const privateKeyHex = process.env.MODULE_SIGNING_PRIVATE_KEY;
if (!privateKeyHex || privateKeyHex.length !== 128) {
  console.error('Error: MODULE_SIGNING_PRIVATE_KEY env var must be a 128-char hex string (32-byte seed + 32-byte public key).');
  process.exit(1);
}

const keyBytes = Buffer.from(privateKeyHex, 'hex');
const seed = keyBytes.slice(0, 32);

const privateKey = crypto.createPrivateKey({
  key: Buffer.concat([
    Buffer.from('302e020100300506032b657004220420', 'hex'), // DER header for Ed25519 private key
    seed,
  ]),
  format: 'der',
  type: 'pkcs8',
});

function signFile(manifestPath, sigPath) {
  if (!fs.existsSync(manifestPath)) {
    console.error(`Error: manifest file not found at ${manifestPath}`);
    process.exit(1);
  }

  const manifestBytes = fs.readFileSync(manifestPath);

  // Sign raw manifest bytes directly (without hashing)
  const signature = crypto.sign(null, manifestBytes, privateKey);

  fs.writeFileSync(sigPath, signature);

  console.log(`✅ Signed: ${path.relative(repoRoot, manifestPath)} → ${path.relative(repoRoot, sigPath)}`);
  console.log(`   Signature size: ${signature.length} bytes`);
}

// Sign website/index.json
signFile(
  path.join(repoRoot, 'website', 'index.json'),
  path.join(repoRoot, 'website', 'index.json.sig')
);

// Sign website/modules/index.json
signFile(
  path.join(repoRoot, 'website', 'modules', 'index.json'),
  path.join(repoRoot, 'website', 'modules', 'index.json.sig')
);
