 /**
 * dmCryptoOps.js — 1-to-1 (DM) Encryption Service
 *
 * Uses the SAME pure-JS cryptographic primitives as groupCryptoOps.js:
 *   • ECDH P-256 key agreement  (groupCrypto.js — ecdhSharedSecret)
 *   • HKDF-SHA-256              (groupCrypto.js — hkdf)
 *   • AES-128-CTR + HMAC-SHA-256 Encrypt-then-MAC (encryptGroupMessage / decryptGroupMessage)
 *
 * The only differences from the group flow are:
 *   1. No "sender key" layer — we derive a shared secret directly from ECDH.
 *   2. A distinct HKDF info label ("dm-message-v1") for domain separation.
 *   3. The shared secret is cached per-peer in a module-level Map.
 */

import {
  getOrCreateGroupKeyPair,
  encodePublicKey,
  decodePublicKey,
  ecdhSharedSecret,
  hkdf,
  encryptGroupMessage,
  decryptGroupMessage,
  gcBufToB64,
} from "./cryptoEngine";
import { fetchPublicKeyApi, publishDMPublicKeyApi } from "../api/dmApi";

// ─── HKDF domain-separation label ──────────────────────────────────────────
// Different from group's "group-message-auth-v1" so a DM key can never
// accidentally be used (or confused with) a group key.
const DM_INFO = new TextEncoder().encode("dm-message-v1");

// ─── In-memory cache: otherUserId → { sharedSecret: Uint8Array, pubKeyB64: string }
// Invalidated automatically if the peer re-uploads their public key.
const dmSecretCache = new Map();

// ─── Ensure our P-256 public key is on the server ──────────────────────────

/**
 * Get-or-create our ECDH key pair and publish the public key to the server.
 * Safe to call on every login — the server upserts idempotently.
 *
 * @param {object} authUser — the logged-in user object (needs `._id`)
 * @returns {Promise<{ privateScalar: BigInt, publicKeyB64: string }>}
 */
export async function getOrPublishDMKey(authUser) {
  const { privateScalar, publicKeyB64 } = await getOrCreateGroupKeyPair(
    authUser._id
  );
  try {
    await publishDMPublicKeyApi(publicKeyB64);
  } catch (e) {
    // Non-fatal — the key may already be published
    console.warn("[DM E2EE] Could not publish public key:", e.message);
  }
  return { privateScalar, publicKeyB64 };
}

// ─── Derive the shared secret for a DM conversation ────────────────────────

/**
 * Derive (and cache) the ECDH shared secret between us and `otherUserId`.
 * Fetches their public key from the server.
 *
 * @param {object}  authUser     — logged-in user
 * @param {string}  otherUserId  — the other participant's user ID
 * @returns {Promise<Uint8Array | null>}  32-byte HKDF-derived secret, or null if the peer has no key yet
 */
export async function getDMSharedSecret(authUser, otherUserId) {
  // 1. Fetch peer's public key
  let theirPubKeyB64;
  try {
    const keyData = await fetchPublicKeyApi(otherUserId);
    theirPubKeyB64 = keyData.publicKey;
  } catch (e) {
    console.warn("[DM E2EE] Could not fetch peer public key:", e.message);
    return null;
  }

  if (!theirPubKeyB64) {
    console.warn("[DM E2EE] Peer has no public key registered yet.");
    return null;
  }

  // 2. Return cached secret if peer key hasn't changed
  const cached = dmSecretCache.get(otherUserId);
  if (cached && cached.pubKeyB64 === theirPubKeyB64) {
    return cached.sharedSecret;
  }

  // 3. Re-derive (new peer key or first time)
  if (cached) {
    console.log("[DM E2EE] Peer key changed — re-deriving shared secret for", otherUserId);
  }

  const { privateScalar } = await getOrCreateGroupKeyPair(authUser._id);
  const { publicX, publicY } = decodePublicKey(theirPubKeyB64);
  const rawShared = ecdhSharedSecret(privateScalar, publicX, publicY); // 32-byte x-coord
  // Apply HKDF with a DM-specific label for domain separation
  const sharedSecret = hkdf(rawShared, null, DM_INFO, 16); // 16 bytes → AES-128 key material

  dmSecretCache.set(otherUserId, { sharedSecret, pubKeyB64: theirPubKeyB64 });
  return sharedSecret;
}

// ─── Encrypt a DM message ───────────────────────────────────────────────────

/**
 * Encrypt a plaintext string for a 1-to-1 message.
 * Uses the same AES-128-CTR + HMAC-SHA-256 Encrypt-then-MAC as group messages.
 *
 * @param {Uint8Array} sharedSecret — 16-byte key derived by getDMSharedSecret
 * @param {string}     plaintext
 * @returns {{ text: string, iv: string, mac: string, isEncrypted: boolean }}
 */
export function encryptDMMessage(sharedSecret, plaintext) {
  const { ciphertext, iv, mac } = encryptGroupMessage(sharedSecret, plaintext);
  return {
    text: ciphertext,
    iv,
    mac,
    isEncrypted: true,
  };
}

// ─── Decrypt a single DM message object ────────────────────────────────────

/**
 * Attempt to decrypt a message object in-place.
 * Returns the message unchanged if it is not encrypted.
 * Returns a placeholder on failure.
 *
 * @param {object}     msg          — message object from the server
 * @param {Uint8Array|null} sharedSecret — derived by getDMSharedSecret
 * @returns {object}  message with plaintext `.text`
 */
export function tryDecryptDMMessage(msg, sharedSecret) {
  // Not encrypted (e.g. image-only or plaintext legacy) — pass through
  if (!msg.isEncrypted || !msg.iv) return msg;

  if (!sharedSecret) {
    return { ...msg, text: "🔒 [key not available — peer has no E2EE key]" };
  }

  try {
    const plain = decryptGroupMessage(sharedSecret, msg.text, msg.iv, msg.mac);
    return { ...msg, text: plain };
  } catch (err) {
    console.warn("[DM E2EE] Decryption failed for msg", msg._id, ":", err.message);
    return {
      ...msg,
      text: "🔒 [Encrypted — key mismatch. Message sent from a different session.]",
    };
  }
}

// ─── Cache management ───────────────────────────────────────────────────────

/** Clear the entire DM shared secret cache (call on logout) */
export function clearDMSecretCache() {
  dmSecretCache.clear();
}

/** Invalidate the cached secret for a specific peer (e.g. they re-generated their key) */
export function clearDMSecretForUser(userId) {
  dmSecretCache.delete(userId);
}
