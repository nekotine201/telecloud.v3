/**
 * Client-Side Encryption Layer for TeleCloud
 * Uses standard Web Crypto API (SubtleCrypto) with AES-GCM (256-bit).
 * Encrypts files in the browser before sending to Telegram MTProto.
 */

export async function deriveKeyFromPassword(password: string, salt: Uint8Array): Promise<CryptoKey> {
  const enc = new TextEncoder();
  const keyMaterial = await window.crypto.subtle.importKey(
    'raw',
    enc.encode(password),
    { name: 'PBKDF2' },
    false,
    ['deriveKey']
  );

  return window.crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: salt as unknown as ArrayBuffer,
      iterations: 100000,
      hash: 'SHA-256',
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

export async function encryptFileBuffer(
  buffer: ArrayBuffer,
  passphrase = 'TeleCloud-Client-MasterKey-2026'
): Promise<{ encryptedBlob: Blob; ivHex: string }> {
  const salt = window.crypto.getRandomValues(new Uint8Array(16));
  const iv = window.crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKeyFromPassword(passphrase, salt);

  const encrypted = await window.crypto.subtle.encrypt(
    {
      name: 'AES-GCM',
      iv,
    },
    key,
    buffer
  );

  // Pack salt + iv + encrypted bytes
  const combined = new Uint8Array(salt.byteLength + iv.byteLength + encrypted.byteLength);
  combined.set(salt, 0);
  combined.set(iv, salt.byteLength);
  combined.set(new Uint8Array(encrypted), salt.byteLength + iv.byteLength);

  const ivHex = Array.from(iv).map(b => b.toString(16).padStart(2, '0')).join('');
  return {
    encryptedBlob: new Blob([combined], { type: 'application/octet-stream' }),
    ivHex,
  };
}

export async function decryptFileBuffer(
  buffer: ArrayBuffer,
  passphrase = 'TeleCloud-Client-MasterKey-2026'
): Promise<ArrayBuffer> {
  const salt = new Uint8Array(buffer.slice(0, 16));
  const iv = new Uint8Array(buffer.slice(16, 28));
  const encryptedData = buffer.slice(28);

  const key = await deriveKeyFromPassword(passphrase, salt);

  return window.crypto.subtle.decrypt(
    {
      name: 'AES-GCM',
      iv,
    },
    key,
    encryptedData
  );
}
