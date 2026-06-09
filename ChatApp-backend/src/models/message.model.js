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
        type: String, // base64 IV used for AES-GCM encryption
    },
    isEncrypted:{
        type: Boolean,
        default: false, // false = old plaintext messages still display correctly
    },
    image:{
        type: String,
    },
},{timestamps:true}
);

const Message = mongoose.model("Message", messageSchema);

export default Message;