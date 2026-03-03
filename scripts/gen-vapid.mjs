// Generate VAPID key pair for Web Push (raw P-256 format via JWK)
const keyPair = await crypto.subtle.generateKey(
  { name: 'ECDH', namedCurve: 'P-256' },
  true,
  ['deriveKey']
);

// Public key: raw uncompressed EC point (65 bytes → 87 base64url chars)
const pubRaw = await crypto.subtle.exportKey('raw', keyPair.publicKey);
const pub = Buffer.from(pubRaw).toString('base64url');

// Private key: export as JWK and grab the 'd' component (raw 32-byte scalar)
const privJwk = await crypto.subtle.exportKey('jwk', keyPair.privateKey);
const priv = privJwk.d; // already base64url-encoded 32-byte scalar

console.log('VAPID_PUBLIC_KEY=' + pub);
console.log('VAPID_PRIVATE_KEY=' + priv);
