#!/usr/bin/env node
// scripts/generate-test-keys.js
// Generates test VERA Pro license keys for local testing using Ed25519 signing
// Usage: node scripts/generate-test-keys.js [count]
// Example: node scripts/generate-test-keys.js 5

require('dotenv').config({ path: '.env.local' });
const crypto = require('crypto');
const { generateLicenseKey } = require('../netlify/functions/license-helper');

// Default to the developer's active private key hex for ease of local development
const PRIVATE_KEY_HEX = process.env.LICENSE_SIGNING_PRIVATE_KEY || '302e020100300506032b657004220420784c18c0e54397af5f30648b213d64a2a907be7f9fdf7850c9129e1eae4373af';
process.env.LICENSE_SIGNING_PRIVATE_KEY = PRIVATE_KEY_HEX;

const count = parseInt(process.argv[2] || '3', 10);

function decodeKey(key) {
  try {
    const stripped = key.replace('VERA-PRO-', '');
    const decoded = Buffer.from(stripped, 'base64');
    
    // Split combined payload and signature: [payload] + [64-byte signature]
    const payloadBytes = decoded.subarray(0, decoded.length - 64);
    const payload = JSON.parse(payloadBytes.toString('utf8'));
    
    return {
      ...payload,
      expiry_date: payload.expires_at,
      issued_date: payload.issued_at,
    };
  } catch (e) {
    console.error('Decode failed:', e);
    return null;
  }
}

console.log('\n🔑 VERA Pro — Test Ed25519 License Key Generator');
console.log('━'.repeat(60));
console.log(`Private Key Loaded: ${process.env.LICENSE_SIGNING_PRIVATE_KEY.substring(0, 8)}...`);
console.log(`Generating ${count} key(s)...\n`);

for (let i = 1; i <= count; i++) {
  const expiresAt = Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60; // 30 days
  const key = generateLicenseKey('pro', expiresAt);
  const decoded = decodeKey(key);

  console.log(`Key ${i}:`);
  console.log(`  ${key}`);
  console.log(`  Expires:    ${decoded?.expiry_date}`);
  console.log(`  Tier:       ${decoded?.tier}`);
  console.log('');
}

console.log('━'.repeat(60));
console.log('✅ Done. These keys are signed and fully valid for local testing.');
console.log('⚠️  Production keys are generated automatically by the Stripe webhook.\n');
