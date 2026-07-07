import mongoose from "mongoose";

const groupMessageSchema = new mongoose.Schema(
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
    text: {
      type: String, // stores base64 ciphertext when isEncrypted=true
    },
    iv: {
      type: String, // base64 IV (nonce) used for AES-CTR encryption
    },
    mac: {
      type: String, // base64 HMAC-SHA-256 of (iv || ciphertext) — Encrypt-then-MAC
    },
    isEncrypted: {
      type: Boolean,
      default: false,
    },
    image: {
      type: String,
    },
  },
  { timestamps: true }
);

const GroupMessage = mongoose.model("GroupMessage", groupMessageSchema);

export default GroupMessage;
