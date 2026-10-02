'use strict';
// W28 Flow endpoint envelope (decrypt request / encrypt response).
// PLACEHOLDER MIRROR: booking-flow-endpoint.md section 1 says reuse Meta's reference Node endpoint
// (WhatsApp-Flows-Tools examples/endpoint/nodejs, decryptRequest/encryptResponse) verbatim. No web lookups were
// allowed in this pass, so this file mirrors the documented algorithm with node:crypto primitives only so the
// offline tests can round-trip. At W28 step 2, replace the two function bodies with Meta's published code and
// keep the exported names; W28.test.mjs must still pass unchanged.
//   request : RSA-OAEP(SHA-256) unwrap of encrypted_aes_key with FLOW_PRIVATE_KEY,
//             AES-128-GCM decrypt of encrypted_flow_data (last 16 bytes = tag) with initial_vector
//   response: AES-128-GCM with the same key and the IV with every bit flipped, ciphertext||tag, base64
const crypto = require('crypto');

class FlowEndpointException extends Error {
  constructor(statusCode, message) { super(message); this.statusCode = statusCode; }
}

function decryptRequest(body, privatePem, passphrase) {
  const { encrypted_aes_key, encrypted_flow_data, initial_vector } = body || {};
  let aesKey;
  try {
    const key = crypto.createPrivateKey({ key: privatePem, passphrase: passphrase || undefined });
    aesKey = crypto.privateDecrypt({ key, padding: crypto.constants.RSA_PKCS1_OAEP_PADDING, oaepHash: 'sha256' }, Buffer.from(encrypted_aes_key, 'base64'));
  } catch (e) {
    throw new FlowEndpointException(421, 'Failed to decrypt the request. Please verify your private key.');
  }
  const flowBuf = Buffer.from(encrypted_flow_data, 'base64');
  const iv = Buffer.from(initial_vector, 'base64');
  const TAG = 16;
  try {
    const d = crypto.createDecipheriv('aes-128-gcm', aesKey, iv);
    d.setAuthTag(flowBuf.subarray(-TAG));
    const json = Buffer.concat([d.update(flowBuf.subarray(0, -TAG)), d.final()]).toString('utf8');
    return { decryptedBody: JSON.parse(json), aesKeyBuffer: aesKey, initialVectorBuffer: iv };
  } catch (e) {
    throw new FlowEndpointException(421, 'Failed to decrypt the request.');
  }
}

function encryptResponse(response, aesKeyBuffer, initialVectorBuffer) {
  const flipped = Buffer.from(initialVectorBuffer.map((b) => ~b & 0xff));
  const c = crypto.createCipheriv('aes-128-gcm', aesKeyBuffer, flipped);
  return Buffer.concat([c.update(JSON.stringify(response), 'utf8'), c.final(), c.getAuthTag()]).toString('base64');
}

module.exports = { decryptRequest, encryptResponse, FlowEndpointException };
