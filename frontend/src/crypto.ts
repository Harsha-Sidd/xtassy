/**
 * Xtassy Cryptography Module
 * Client-Side End-to-End Encryption (E2EE) using Web Crypto API
 * Standard AES-GCM 256-bit encryption with PBKDF2 Key Derivation
 * Refactored to include:
 * - Client-Side Metadata Masking (EXIF scrubbing & Generic file naming)
 * - Cryptographic size masking / block padding (nearest 256KB block)
 */

// Helper to convert an ArrayBuffer to a Base64 string
function bufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return window.btoa(binary);
}

// Helper to convert a Base64 string to an ArrayBuffer
function base64ToBuffer(base64: string): ArrayBuffer {
  const binaryString = window.atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes.buffer as ArrayBuffer;
}

// Convert string to UTF-8 Uint8Array
function stringToBuffer(str: string): Uint8Array {
  return new TextEncoder().encode(str);
}

// Convert ArrayBuffer to UTF-8 string
function bufferToString(buffer: ArrayBuffer): string {
  return new TextDecoder().decode(buffer);
}

/**
 * Derive an AES-GCM 256-bit cryptographic key from a user's passphrase and a salt.
 */
async function deriveKey(passphrase: string, salt: Uint8Array): Promise<CryptoKey> {
  const baseKey = await window.crypto.subtle.importKey(
    'raw',
    stringToBuffer(passphrase) as any,
    { name: 'PBKDF2' },
    false,
    ['deriveKey']
  );

  return window.crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: salt as any,
      iterations: 100000,
      hash: 'SHA-256'
    },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

export interface EncryptedPayload {
  ciphertext: string; // Base64
  iv: string;         // Base64
  salt: string;       // Base64
}

/**
 * Encrypt a text message using AES-GCM (256-bit) E2EE
 */
export async function encryptText(text: string, passphrase: string): Promise<EncryptedPayload> {
  const salt = window.crypto.getRandomValues(new Uint8Array(16));
  const iv = window.crypto.getRandomValues(new Uint8Array(12));
  
  const key = await deriveKey(passphrase, salt);
  const plaintextBuffer = stringToBuffer(text);
  
  const ciphertextBuffer = await window.crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: iv as any },
    key,
    plaintextBuffer as any
  );

  return {
    ciphertext: bufferToBase64(ciphertextBuffer),
    iv: bufferToBase64(iv.buffer as ArrayBuffer),
    salt: bufferToBase64(salt.buffer as ArrayBuffer)
  };
}

/**
 * Decrypt an AES-GCM E2EE message
 * Throws an error if decryption fails (e.g. invalid key or tampered ciphertext)
 */
export async function decryptText(payload: EncryptedPayload, passphrase: string): Promise<string> {
  const salt = new Uint8Array(base64ToBuffer(payload.salt));
  const iv = new Uint8Array(base64ToBuffer(payload.iv));
  const ciphertext = base64ToBuffer(payload.ciphertext);

  const key = await deriveKey(passphrase, salt);
  
  const decryptedBuffer = await window.crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: iv as any },
    key,
    ciphertext
  );

  return bufferToString(decryptedBuffer);
}

/**
 * FEATURE 7: Client-side cryptographic size padding / block masking
 * Pads the buffer to the nearest 256KB block to prevent file size analysis.
 * Prefix structure: [4 bytes originalLength] + [raw file bytes] + [padding zeros]
 */
export function padBuffer(buffer: ArrayBuffer, blockSize: number = 256 * 1024): ArrayBuffer {
  const originalLength = buffer.byteLength;
  const totalLengthWithPrefix = originalLength + 4;
  
  // Calculate padded size to match a multiple of blockSize
  const remainder = totalLengthWithPrefix % blockSize;
  const paddedSize = remainder === 0 ? totalLengthWithPrefix : totalLengthWithPrefix + (blockSize - remainder);

  const paddedBuffer = new ArrayBuffer(paddedSize);
  const paddedView = new Uint8Array(paddedBuffer);
  
  // 1. Write the original length in the first 4 bytes (Big Endian)
  const lengthView = new DataView(paddedBuffer);
  lengthView.setUint32(0, originalLength, false);

  // 2. Copy the actual file contents starting at byte 4
  const originalView = new Uint8Array(buffer);
  paddedView.set(originalView, 4);

  // 3. The rest of the bytes are left as 0 (zeros serve as padding)
  return paddedBuffer;
}

/**
 * FEATURE 7: Client-side cryptographic size unpadding
 * Restores the original buffer from a padded buffer by reading the prefix length.
 */
export function unpadBuffer(paddedBuffer: ArrayBuffer): ArrayBuffer {
  const lengthView = new DataView(paddedBuffer);
  const originalLength = lengthView.getUint32(0, false);
  
  const unpaddedBuffer = new ArrayBuffer(originalLength);
  const unpaddedView = new Uint8Array(unpaddedBuffer);
  
  const paddedView = new Uint8Array(paddedBuffer);
  unpaddedView.set(paddedView.subarray(4, 4 + originalLength));
  
  return unpaddedBuffer;
}

/**
 * FEATURE 7: Client-side EXIF metadata scrubbing using Canvas rendering.
 * Renders an image file to an offscreen canvas and exports it back to a clean blob.
 */
export function scrubImageMetadata(file: File): Promise<Blob> {
  return new Promise((resolve) => {
    // If not an image, resolve immediately with original file blob
    if (!file.type.startsWith('image/')) {
      return resolve(file);
    }

    const img = new Image();
    img.src = URL.createObjectURL(file);
    
    img.onload = () => {
      URL.revokeObjectURL(img.src);
      
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(img, 0, 0);
        // Export back to original mimeType, ensuring all EXIF metadata is dropped
        canvas.toBlob((blob) => {
          if (blob) {
            resolve(blob);
          } else {
            resolve(file); // Fallback to original on error
          }
        }, file.type);
      } else {
        resolve(file);
      }
    };

    img.onerror = () => {
      resolve(file);
    };
  });
}

/**
 * FEATURE 7: Client-side generic naming override
 * Generates a generic, safe filename to hide original metadata.
 */
export function maskFilename(originalName: string): string {
  const extension = originalName.split('.').pop() || 'dat';
  const genericHash = Math.random().toString(36).substr(2, 9);
  return `generic_attachment_${genericHash}.${extension}`;
}

/**
 * FEATURE 3: Encrypt a file (ArrayBuffer) using AES-GCM with size padding
 */
export async function encryptFile(
  fileData: ArrayBuffer,
  passphrase: string
): Promise<{ encryptedData: ArrayBuffer; iv: string; salt: string }> {
  // Apply size masking padding prior to encryption
  const paddedData = padBuffer(fileData);

  const salt = window.crypto.getRandomValues(new Uint8Array(16));
  const iv = window.crypto.getRandomValues(new Uint8Array(12));
  
  const key = await deriveKey(passphrase, salt);
  
  const encryptedData = await window.crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: iv as any },
    key,
    paddedData
  );

  return {
    encryptedData,
    iv: bufferToBase64(iv.buffer as ArrayBuffer),
    salt: bufferToBase64(salt.buffer as ArrayBuffer)
  };
}

/**
 * FEATURE 3: Decrypt a file (ArrayBuffer) using AES-GCM with size unpadding
 */
export async function decryptFile(
  encryptedData: ArrayBuffer,
  ivBase64: string,
  saltBase64: string,
  passphrase: string
): Promise<ArrayBuffer> {
  const salt = new Uint8Array(base64ToBuffer(saltBase64));
  const iv = new Uint8Array(base64ToBuffer(ivBase64));
  
  const key = await deriveKey(passphrase, salt);
  
  const decryptedPaddedData = await window.crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: iv as any },
    key,
    encryptedData
  );

  // Unpad size masking padding post-decryption
  return unpadBuffer(decryptedPaddedData);
}

export interface MiningResult {
  nonce: number;
  hash: string;
  duration: number; // ms
}

// SHA-256 helper converting Uint8Array to Hex string
async function sha256(message: string): Promise<string> {
  const msgBuffer = new TextEncoder().encode(message);
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Solves local Hashcash Proof-of-Work challenge by increments.
 * Yields event loop execution every 15 nonces to avoid UI freezing.
 */
export async function solveClearanceChallenge(
  username: string,
  targetRing: number,
  difficulty: number,
  onProgress: (nonce: number, currentHash: string) => void
): Promise<MiningResult> {
  const startTime = Date.now();
  let nonce = 0;
  const prefix = '0'.repeat(difficulty);
  const baseString = `${username.toLowerCase()}_ring${targetRing}_`;

  while (true) {
    const candidate = `${baseString}${nonce}`;
    const hash = await sha256(candidate);
    
    // Call progress callback and brief sleep to prevent page freezing
    if (nonce % 15 === 0) {
      onProgress(nonce, hash);
      await new Promise(r => setTimeout(r, 0));
    }

    if (hash.startsWith(prefix)) {
      // Call one final time on finish
      onProgress(nonce, hash);
      return {
        nonce,
        hash,
        duration: Date.now() - startTime
      };
    }
    nonce++;
  }
}

/**
 * Assesses the entropy score of an E2EE room shared passphrase.
 */
export function checkPassphraseEntropy(passphrase: string): { score: number; feedback: string } {
  let score = 0;
  if (passphrase.length >= 8) score += 1;
  if (passphrase.length >= 12) score += 1;
  if (/[A-Z]/.test(passphrase)) score += 1;
  if (/[a-z]/.test(passphrase)) score += 1;
  if (/[0-9]/.test(passphrase)) score += 1;
  if (/[^A-Za-z0-9]/.test(passphrase)) score += 1;

  let feedback = 'Low entropy.';
  if (score >= 5) feedback = 'High entropy.';
  else if (score >= 3) feedback = 'Medium entropy.';

  return { score, feedback };
}
