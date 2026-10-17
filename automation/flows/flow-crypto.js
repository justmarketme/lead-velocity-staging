'use strict';
// W28 Flow endpoint envelope (decrypt request / encrypt response) - I-34g.
// Implements WhatsApp Flows endpoint encryption as Meta documents it (same steps and error code as Meta's reference
// WhatsApp-Flows-Tools examples/endpoint/nodejs decryptRequest/encryptResponse, node:crypto only, no hand-rolled crypto):
//   request : encrypted_aes_key = RSA-OAEP (SHA-256 hash and MGF1) of a 128-bit AES key under our registered public key;
//             encrypted_flow_data = AES-128-GCM ciphertext with the 16-byte tag appended; initial_vector = the IV
//   response: AES-128-GCM with the SAME key and the IV with every bit flipped; base64(ciphertext || 16-byte tag)
//   failure : HTTP 421 ("re-fetch the public key") on any decryption problem; never 200 with a plaintext body.
// VERIFIED 2026-10-11 against Meta's "Implementing your Flow endpoint" guide (developers.facebook.com/documentation/
// business-messaging/whatsapp/flows/guides/implementingyourflowendpoint) and the Flows error-code reference: request
// fields encrypted_flow_data / encrypted_aes_key / initial_vector (base64); AES key = RSA/ECB/OAEPWithSHA-256AndMGF1
// (SHA-256 for MGF1) under a 2048-bit key; payload AES-128-GCM with the 16-byte tag appended; response = same key, IV
// with every byte XOR 0xFF, tag appended, base64, sent as text/plain; 421 = cannot decrypt (client re-fetches the key),
// 427 = flow token no longer valid, 432 = request signature failed. Nothing here needed changing. The request signature
// (X-Hub-Signature-256, app secret) is checked by the caller (W28 "Verify + decrypt"). Still to do once, by a person:
// the Flow Builder endpoint health check before publish (W28 step 5) and uploading the public key per sending number.
// The Flows are sent through Twilio (whatsapp/flows Content) but Meta still calls THIS endpoint directly.
const crypto = require('crypto');

class FlowEndpointException extends Error {
  constructor(statusCode, message) { super(message); this.statusCode = statusCode; }
}

function decryptRequest(body, privatePem, passphrase) {
  const { encrypted_aes_key, encrypted_flow_data, initial_vector } = body || {};
  if (![encrypted_aes_key, encrypted_flow_data, initial_vector].every((x) => typeof x === 'string' && x.length)) {
    throw new FlowEndpointException(421, 'Failed to decrypt the request. Missing encryption fields.');
  }
  let aesKey;
  try {
    const key = crypto.createPrivateKey({ key: privatePem, passphrase: passphrase || undefined });
    aesKey = crypto.privateDecrypt({ key, padding: crypto.constants.RSA_PKCS1_OAEP_PADDING, oaepHash: 'sha256' }, Buffer.from(encrypted_aes_key, 'base64'));
    if (aesKey.length !== 16) throw new Error('AES key is not 128-bit');
  } catch (e) {
    throw new FlowEndpointException(421, 'Failed to decrypt the request. Please verify your private key.');
  }
  const flowBuf = Buffer.from(encrypted_flow_data, 'base64');
  const iv = Buffer.from(initial_vector, 'base64');
  const TAG = 16;
  if (flowBuf.length <= TAG || iv.length < 12) throw new FlowEndpointException(421, 'Failed to decrypt the request.');
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
