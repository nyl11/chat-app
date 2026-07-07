import {
  getOrCreateGroupKeyPair,
  getOrCreateSenderKey,
  storeSenderKey,
  loadSenderKey,
  wrapSenderKey,
  unwrapSenderKey,
  ecdhSharedSecret,
  decodePublicKey,
  encryptGroupMessage,
  decryptGroupMessage,
} from "./cryptoEngine";
import {
  fetchPendingKeysApi,
  fetchMembersKeysApi,
  distributeKeyApi,
  publishPublicKeyApi,
} from "../api/groupApi";

// ─── Low-level ECDH helper ─────────────────────────────────────────────────

/**
 * Derive an ECDH shared secret between our private scalar and
 * another member's base64-encoded public key.
 */
export function deriveSharedWith(myPrivateScalar, theirPublicKeyB64) {
  const { publicX, publicY } = decodePublicKey(theirPublicKeyB64);
  return ecdhSharedSecret(myPrivateScalar, publicX, publicY); // Uint8Array(32)
}

// ─── Message helpers ───────────────────────────────────────────────────────

/**
 * Try to decrypt a single message object.
 * Returns the message with decrypted text, or a placeholder if the
 * sender key is not yet available.
 */
export async function tryDecryptMessage(msg) {
  if (!msg.isEncrypted || !msg.text) return msg;
  const senderId =
    typeof msg.senderId === "object" ? msg.senderId._id : msg.senderId;
  try {
    const sk = await loadSenderKey(senderId, msg.groupId || msg.group);
    if (!sk) return { ...msg, text: "🔒 [key not yet received]" };
    const plain = decryptGroupMessage(sk, msg.text, msg.iv, msg.mac);
    return { ...msg, text: plain };
  } catch {
    return { ...msg, text: "⚠️ [decryption failed]" };
  }
}

/**
 * Build a text message payload by encrypting the plaintext with the
 * caller's sender key.
 */
export function buildEncryptedPayload(senderKey, messageData) {
  if (!messageData.text) {
    // Image-only: not encrypted in this implementation
    return { ...messageData, isEncrypted: false };
  }
  const { ciphertext, iv, mac } = encryptGroupMessage(senderKey, messageData.text);
  return {
    text: ciphertext,
    iv,
    mac,
    isEncrypted: true,
    image: messageData.image ?? null,
  };
}

// ─── Key management helpers ────────────────────────────────────────────────

/**
 * Fetch and decrypt any pending Sender Keys addressed to `authUser`
 * for the given group, then persist them to local storage.
 */
export async function fetchAndStoreKeys(authUser, groupId) {
  const { privateScalar } = await getOrCreateGroupKeyPair(authUser._id);
  const pending = await fetchPendingKeysApi(groupId);

  for (const item of pending) {
    if (!item.senderPublicKey) continue;
    try {
      const sharedSecret = deriveSharedWith(privateScalar, item.senderPublicKey);
      const senderKey = unwrapSenderKey(
        item.encryptedKey,
        item.nonce,
        item.mac,
        sharedSecret
      );
      await storeSenderKey(item.senderId, groupId, senderKey);
    } catch (e) {
      console.warn(`[E2EE] Failed to unwrap key from ${item.senderId}:`, e.message);
    }
  }
}

/**
 * Wrap our Sender Key for every member in `recipientList` (or all members
 * if omitted) and POST the bundle to the server.
 * Also publishes our own public key so others can send keys back.
 */
export async function distributeOurSenderKey(authUser, groupId, recipientList) {
  const { privateScalar, publicKeyB64 } = await getOrCreateGroupKeyPair(authUser._id);
  const mySenderKey = await getOrCreateSenderKey(authUser._id, groupId);

  // Publish our public key FIRST so recipients can derive the shared ECDH
  // secret needed to unwrap the sender key we're about to distribute.
  await publishPublicKeyApi(publicKeyB64);

  let members = recipientList;
  if (!members) {
    members = await fetchMembersKeysApi(groupId);
  }

  const payload = [];
  for (const member of members) {
    if (member.userId === authUser._id) continue; // skip self
    if (!member.publicKey) continue;              // skip members without a registered key
    try {
      const sharedSecret = deriveSharedWith(privateScalar, member.publicKey);
      const wrapped = wrapSenderKey(mySenderKey, sharedSecret);
      payload.push({ recipientId: member.userId, ...wrapped });
    } catch (e) {
      console.warn(`[E2EE] Could not wrap key for ${member.userId}:`, e.message);
    }
  }

  if (payload.length > 0) {
    await distributeKeyApi(groupId, payload);
  }
}
