const crypto = require('crypto');

/**
 * Generate Ed25519-signed license key
 * @param {string} tier - 'pro' or 'free'
 * @param {number|string|null} expiresAt - expiration (timestamp in seconds or ISO date string)
 * @param {string|null} hardwareHash - optional hardware fingerprint
 * @returns {string} Base64 license key with VERA-PRO- prefix
 */
function generateLicenseKey(tier, expiresAt, hardwareHash = null) {
  const privateKeyHex = process.env.LICENSE_SIGNING_PRIVATE_KEY;
  if (!privateKeyHex) {
    throw new Error('LICENSE_SIGNING_PRIVATE_KEY not configured');
  }

  // Load private key from hex
  const privateKeyBuffer = Buffer.from(privateKeyHex.trim(), 'hex');
  
  let privateKey;
  if (privateKeyBuffer.length === 32) {
    // Construct PKCS8 DER signature from 32-byte raw seed (Node 12+)
    privateKey = crypto.createPrivateKey({
      key: Buffer.concat([
        Buffer.from('302e020100300506032b657004220420', 'hex'),
        privateKeyBuffer
      ]),
      format: 'der',
      type: 'pkcs8'
    });
  } else {
    // Load 48-byte PKCS8 DER key directly
    privateKey = crypto.createPrivateKey({
      key: privateKeyBuffer,
      format: 'der',
      type: 'pkcs8'
    });
  }

  // Calculate standard expiry string (chrono DateTime expects ISO8601 string)
  let expiresIso = null;
  if (expiresAt) {
    if (typeof expiresAt === 'number') {
      expiresIso = new Date(expiresAt * 1000).toISOString();
    } else {
      expiresIso = new Date(expiresAt).toISOString();
    }
  }

  // Build payload matching Rust's SignedLicense struct
  const payload = {
    tier: tier,
    expires_at: expiresIso,
    hardware_hash: hardwareHash,
    issued_at: new Date().toISOString(),
  };

  const payloadJson = JSON.stringify(payload);
  const payloadBuffer = Buffer.from(payloadJson, 'utf8');

  // Sign using Ed25519
  const signature = crypto.sign(null, payloadBuffer, privateKey);

  // Combine payload and signature: [payload] + [64-byte signature]
  // Note: Rust verify_license_key splits at length - 64, so it's [payload_bytes] + [signature_bytes]
  const combined = Buffer.concat([payloadBuffer, signature]);
  
  // Base64 encode the combined buffer using standard base64 (not base64url!)
  const base64 = combined.toString('base64');

  return `VERA-PRO-${base64}`;
}

module.exports = { generateLicenseKey };
