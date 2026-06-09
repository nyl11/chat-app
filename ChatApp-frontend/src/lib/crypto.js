// ============================================================
// crypto.js — End-to-End Encryption using Web Crypto API only
// No external libraries required.
// ============================================================

const DB_NAME = "ChatAppE2EE";
const DB_VERSION = 1;
const STORE_NAME = "keys";

// ─────────────────────────────────────────────────────────────
// IndexedDB helpers — private keys are stored here securely.
// Unlike localStorage, IndexedDB can hold real CryptoKey objects.
// ─────────────────────────────────────────────────────────────

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      e.target.result.createObjectStore(STORE_NAME);
    };
    req.onsuccess = (e) => resolve(e.target.result);
    req.onerror = (e) => reject(e.target.error);
  });
}

async function saveToIDB(key, value) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).put(value, key);
    tx.oncomplete = resolve;
    tx.onerror = (e) => reject(e.target.error);
  });
}

async function loadFromIDB(key) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const req = tx.objectStore(STORE_NAME).get(key);
    req.onsuccess = (e) => resolve(e.target.result ?? null);
    req.onerror = (e) => reject(e.target.error);
  });
}

// ─────────────────────────────────────────────────────────────
// Base64 helpers — convert raw bytes ↔ base64 strings
// ─────────────────────────────────────────────────────────────

export function bufferToBase64(buffer) {
  return btoa(String.fromCharCode(...new Uint8Array(buffer)));
}

export function base64ToBuffer(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

// ─────────────────────────────────────────────────────────────
// ECDH Key Pair Generation
//
// Each user generates ONE key pair (private + public).
// - Private key stays in IndexedDB, never leaves the browser.
// - Public key is uploaded to the server so others can derive
//   a shared secret with you.
//
// getOrCreateKeyPair() is idempotent:
//   First call  → generates new key pair and saves to IndexedDB
//   Later calls → loads the existing pair from IndexedDB
// ─────────────────────────────────────────────────────────────

export async function getOrCreateKeyPair(userId) {
  const existingPrivate = await loadFromIDB(`privateKey_${userId}`);
  const existingPublic = await loadFromIDB(`publicKey_${userId}`);

  if (existingPrivate && existingPublic) {
    return { privateKey: existingPrivate, publicKey: existingPublic };
  }

  // Generate a fresh ECDH key pair using the P-256 curve
  const keyPair = await window.crypto.subtle.generateKey(
    { name: "ECDH", namedCurve: "P-256" },
    true, // extractable=true lets us export the PUBLIC key to send to server
    ["deriveKey", "deriveBits"]
  );

  // Save both keys to IndexedDB (the private key never leaves the browser)
  await saveToIDB(`privateKey_${userId}`, keyPair.privateKey);
  await saveToIDB(`publicKey_${userId}`, keyPair.publicKey);

  return keyPair;
}

// ─────────────────────────────────────────────────────────────
// Export / Import Public Key
//
// exportPublicKey: CryptoKey → base64 string (to send to server)
// importPublicKey: base64 string (from server) → CryptoKey
// ─────────────────────────────────────────────────────────────

export async function exportPublicKey(publicKey) {
  const exported = await window.crypto.subtle.exportKey("raw", publicKey);
  return bufferToBase64(exported);
}

export async function importPublicKey(base64) {
  const buffer = base64ToBuffer(base64);
  return window.crypto.subtle.importKey(
    "raw",
    buffer,
    { name: "ECDH", namedCurve: "P-256" },
    true,
    [] // public keys have no usages on their own
  );
}

// ─────────────────────────────────────────────────────────────
// Derive a Shared AES-GCM Key (the core of E2EE)
//
// Using ECDH math:
//   Alice(private) + Bob(public)   → same 256-bit secret
//   Bob(private)   + Alice(public) → same 256-bit secret
//
// Neither user sends the secret — it's derived mathematically.
// ─────────────────────────────────────────────────────────────

export async function deriveSharedKey(myPrivateKey, theirPublicKey) {
  return window.crypto.subtle.deriveKey(
    { name: "ECDH", public: theirPublicKey },
    myPrivateKey,
    { name: "AES-GCM", length: 256 },
    false, // not extractable — the AES key never leaves the browser
    ["encrypt", "decrypt"]
  );
}

// ─────────────────────────────────────────────────────────────
// Encrypt a Message (AES-GCM)
//
// CRITICAL: Generate a NEW random 12-byte IV for EVERY message.
// Reusing an IV with the same key completely breaks AES-GCM.
//
// Returns { iv: base64, ciphertext: base64 }
// ─────────────────────────────────────────────────────────────

export async function encryptMessage(aesKey, plaintext) {
  const iv = window.crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(plaintext);

  const ciphertext = await window.crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    aesKey,
    encoded
  );

  return {
    iv: bufferToBase64(iv.buffer),
    ciphertext: bufferToBase64(ciphertext),
  };
}

// ─────────────────────────────────────────────────────────────
// Decrypt a Message (AES-GCM)
//
// Takes { iv: base64, ciphertext: base64 } and returns plaintext.
// ─────────────────────────────────────────────────────────────

export async function decryptMessage(aesKey, ivBase64, ciphertextBase64) {
  const iv = base64ToBuffer(ivBase64);
  const ciphertext = base64ToBuffer(ciphertextBase64);

  const decrypted = await window.crypto.subtle.decrypt(
    { name: "AES-GCM", iv },
    aesKey,
    ciphertext
  );

  return new TextDecoder().decode(decrypted);
}

// ─────────────────────────────────────────────────────────────
// Shared Key Cache
//
// Cache derived AES keys in memory (per conversation partner)
// to avoid re-deriving on every single message.
// Map<userId, CryptoKey>
// ─────────────────────────────────────────────────────────────

const sharedKeyCache = new Map();

export async function getSharedKey(myPrivateKey, theirUserId, theirPublicKeyBase64) {
  if (sharedKeyCache.has(theirUserId)) {
    return sharedKeyCache.get(theirUserId);
  }
  const theirPublicKey = await importPublicKey(theirPublicKeyBase64);
  const sharedKey = await deriveSharedKey(myPrivateKey, theirPublicKey);
  sharedKeyCache.set(theirUserId, sharedKey);
  return sharedKey;
}

// Clear cache on logout so stale keys don't persist in memory
export function clearSharedKeyCache() {
  sharedKeyCache.clear();
}