import mongoose from "mongoose";

const messageSchema = new mongoose.Schema({
    senderId:{
        type:mongoose.Schema.Types.ObjectId,
        ref:"User",
        required:true,
    },
    reciverId:{
        type:mongoose.Schema.Types.ObjectId,
        ref:"User",
        required:true,
    },
    text:{
        type: String, // stores base64 ciphertext when isEncrypted=true
    },
    iv:{
        type: String, // base64 nonce (12 bytes) used for AES-CTR encryption
    },
    mac: {
        type: String, // base64 HMAC-SHA-256 of (iv || ciphertext) — Encrypt-then-MAC
    },
    isEncrypted:{
        type: Boolean,
        default: false,
    },
    image:{
        type: String,
    },
},{timestamps:true}
);

const Message = mongoose.model("Message", messageSchema);

export default Message;