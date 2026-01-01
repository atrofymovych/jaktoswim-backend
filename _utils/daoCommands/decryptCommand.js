// decryptCommand.js
const crypto = require('crypto');
const ALGO = 'aes-256-gcm';

function decryptCommand({ ciphertext, iv, tag }, hexKey) {
  const key = Buffer.from(hexKey, 'hex');
  if (key.length !== 32) {
    throw new Error(`Decrypt key must be 64-символьный hex (32 байта), а получено ${key.length} байт`);
  }

  const decipher = crypto.createDecipheriv(ALGO, key, Buffer.from(iv, 'base64'));

  if (tag) decipher.setAuthTag(Buffer.from(tag, 'base64'));

  const decrypted = Buffer.concat([decipher.update(Buffer.from(ciphertext, 'base64')), decipher.final()]);

  const result = decrypted.toString('utf8');
  return result;
}

module.exports = { decryptCommand };
