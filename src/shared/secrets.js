// Encrypts secrets kept in the database (calendar refresh tokens), so a copy of the database alone
// doesn't give access to anyone's calendar. AES-256-GCM, with a key derived from
// BETTER_AUTH_SECRET: changing that secret signs everyone out and disconnects every calendar.

import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from 'node:crypto';

const key = () => {
  const secret = process.env.BETTER_AUTH_SECRET;
  if (!secret) throw new Error('BETTER_AUTH_SECRET is not set; it is needed to encrypt calendar access');
  return Buffer.from(hkdfSync('sha256', secret, 'oriana-agent', 'calendar-tokens', 32));
};

// text -> "v1.<iv>.<tag>.<ciphertext>" (base64url parts)
export function encrypt(text) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key(), iv);
  const data = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
  return ['v1', iv, cipher.getAuthTag(), data].map((part) => (typeof part === 'string' ? part : part.toString('base64url'))).join('.');
}

export function decrypt(value) {
  const [version, iv, tag, data] = value.split('.');
  if (version !== 'v1') throw new Error('Unknown secret format');
  const decipher = createDecipheriv('aes-256-gcm', key(), Buffer.from(iv, 'base64url'));
  decipher.setAuthTag(Buffer.from(tag, 'base64url'));
  return Buffer.concat([decipher.update(Buffer.from(data, 'base64url')), decipher.final()]).toString('utf8');
}
