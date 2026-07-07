import mongoose from "mongoose";

// Stores one wrapped (encrypted) copy of a member's Sender Key
// addressed to a specific recipient.
//
// Protocol:
//   1. sender generates a random 16-byte Sender Key for the group
//   2. For every other member, the Sender Key is wrapped (AES-CTR-encrypted)
//      under an ECDH-derived per-pair secret and stored here.
//   3. Each recipient fetches their own pending records, unwraps the key,
//      and stores it in their browser IndexedDB.
//   4. `delivered` is set to true once the recipient has fetched the record
//      so we don't re-send it on every poll.

const groupKeyDistributionSchema = new mongoose.Schema(
  {
    groupId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Group",
      required: true,
    },
    senderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    recipientId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    // AES-CTR-encrypted sender key (base64)
    encryptedKey: {
      type: String,
      required: true,
    },
    // 12-byte AES-CTR nonce used during wrapping (base64)
    nonce: {
      type: String,
      required: true,
    },
    // HMAC-SHA-256 of (nonce || encryptedKey) using the HKDF-derived wrap key (base64)
    mac: {
      type: String,
      required: true,
    },
    // Set to true once the recipient fetches and acknowledges the key
    delivered: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true }
);

// Ensure each (group, sender, recipient) has at most one active key at a time
groupKeyDistributionSchema.index(
  { groupId: 1, senderId: 1, recipientId: 1 },
  { unique: true }
);

const GroupKeyDistribution = mongoose.model(
  "GroupKeyDistribution",
  groupKeyDistributionSchema
);

export default GroupKeyDistribution;
