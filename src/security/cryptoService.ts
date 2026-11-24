const PBKDF2_ITERATIONS = 100_000;
const PBKDF2_SALT = new TextEncoder().encode('AquaPlants-AquaBrain-PBKDF2-Salt-v1');
const AES_GCM_IV_BYTES = 12;
const DECRYPT_ERROR_MESSAGE =
  'Error de descifrado: clave criptográfica inválida o payload corrupto.';

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

let cachedSecret: string | null = null;
let cachedAesKeyPromise: Promise<CryptoKey> | null = null;

function getSubtleCrypto(): SubtleCrypto {
  const cryptoApi = globalThis.crypto;
  if (!cryptoApi?.subtle) {
    throw new Error('Web Crypto API (crypto.subtle) no está disponible en este entorno.');
  }
  return cryptoApi.subtle;
}

function getSecretKeyMaterial(): string {
  const secret = import.meta.env.VITE_CRYPTO_SECRET_KEY;
  if (typeof secret !== 'string' || secret.trim().length === 0) {
    throw new Error('La variable de entorno VITE_CRYPTO_SECRET_KEY no está configurada.');
  }
  return secret;
}

export function isCryptoConfigured(): boolean {
  const secret = import.meta.env.VITE_CRYPTO_SECRET_KEY;
  return typeof secret === 'string' && secret.trim().length > 0;
}

function bytesToBase64(bytes: Uint8Array): string {
  const chunkSize = 0x8000;
  let binary = '';
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
}

function base64ToBytes(base64: string): Uint8Array<ArrayBuffer> {
  if (!base64 || !/^[A-Za-z0-9+/]+={0,2}$/.test(base64)) {
    throw new Error('Formato Base64 inválido.');
  }
  const binary = atob(base64);
  const buffer = new ArrayBuffer(binary.length);
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

async function deriveAesGcmKey(): Promise<CryptoKey> {
  const secret = getSecretKeyMaterial();
  if (cachedAesKeyPromise && cachedSecret === secret) {
    return cachedAesKeyPromise;
  }

  const subtle = getSubtleCrypto();
  cachedSecret = secret;
  cachedAesKeyPromise = (async () => {
    const baseKey = await subtle.importKey(
      'raw',
      textEncoder.encode(secret),
      { name: 'PBKDF2' },
      false,
      ['deriveKey'],
    );

    return subtle.deriveKey(
      {
        name: 'PBKDF2',
        salt: PBKDF2_SALT,
        iterations: PBKDF2_ITERATIONS,
        hash: 'SHA-256',
      },
      baseKey,
      {
        name: 'AES-GCM',
        length: 256,
      },
      false,
      ['encrypt', 'decrypt'],
    );
  })();

  try {
    return await cachedAesKeyPromise;
  } catch (error) {
    cachedSecret = null;
    cachedAesKeyPromise = null;
    throw error;
  }
}

/**
 * Cifra un texto plano usando AES-GCM (256 bits) con IV aleatorio de 12 bytes
 * y clave derivada mediante PBKDF2 (100,000 iteraciones, SHA-256).
 * Retorna el formato `base64(iv):base64(ciphertext)`.
 */
export async function encryptData(plainText: string): Promise<string> {
  const subtle = getSubtleCrypto();
  const key = await deriveAesGcmKey();
  const iv = globalThis.crypto.getRandomValues(new Uint8Array(new ArrayBuffer(AES_GCM_IV_BYTES)));
  const encodedPlainText = textEncoder.encode(plainText);

  const cipherBuffer = await subtle.encrypt(
    {
      name: 'AES-GCM',
      iv,
    },
    key,
    encodedPlainText,
  );

  const cipherBytes = new Uint8Array(cipherBuffer);
  return `${bytesToBase64(iv)}:${bytesToBase64(cipherBytes)}`;
}

/**
 * Descifra un payload con formato `base64(iv):base64(ciphertext)` usando AES-GCM (256 bits).
 * Maneja errores retornando un mensaje controlado si la clave o los datos están corruptos.
 */
export async function decryptData(cipherPayload: string): Promise<string> {
  try {
    if (typeof cipherPayload !== 'string' || !cipherPayload.includes(':')) {
      return DECRYPT_ERROR_MESSAGE;
    }

    const parts = cipherPayload.split(':');
    if (parts.length !== 2 || !parts[0] || !parts[1]) {
      return DECRYPT_ERROR_MESSAGE;
    }

    const [ivBase64, cipherBase64] = parts;
    const iv = base64ToBytes(ivBase64);
    if (iv.length !== AES_GCM_IV_BYTES) {
      return DECRYPT_ERROR_MESSAGE;
    }

    const cipherBytes = base64ToBytes(cipherBase64);
    if (cipherBytes.length === 0) {
      return DECRYPT_ERROR_MESSAGE;
    }

    const subtle = getSubtleCrypto();
    const key = await deriveAesGcmKey();

    const plainBuffer = await subtle.decrypt(
      {
        name: 'AES-GCM',
        iv,
      },
      key,
      cipherBytes,
    );

    return textDecoder.decode(plainBuffer);
  } catch {
    return DECRYPT_ERROR_MESSAGE;
  }
}

/**
 * Genera el digest hexadecimal en minúsculas usando SHA-256.
 */
export async function generateSHA256Hash(payload: string): Promise<string> {
  const subtle = getSubtleCrypto();
  const data = textEncoder.encode(payload);
  const digestBuffer = await subtle.digest('SHA-256', data);
  const digestBytes = new Uint8Array(digestBuffer);

  return Array.from(digestBytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

/**
 * Sanitiza entradas de texto eliminando etiquetas HTML (<[^>]*>),
 * caracteres peligrosos (<, >, ", ', /) y espacios extremos.
 */
export function sanitizeInput(input: string): string {
  if (typeof input !== 'string') {
    return '';
  }

  let cleaned = input;
  let previous: string;
  do {
    previous = cleaned;
    cleaned = cleaned.replace(/<[^>]*>/g, '');
  } while (cleaned !== previous);

  return cleaned.replace(/[<>"'/]/g, '').trim();
}
