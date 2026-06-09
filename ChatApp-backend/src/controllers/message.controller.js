import User from "../models/user.model.js"
import Message from "../models/message.model.js"
import cloudinary from "../lib/cloudinary.js"
import { getReceiverSocketId, io } from "../lib/socket.js";

// Get friends for the sidebar (replaces all-users list)
export const getUsersForSidebar = async (req, res) => {
    try {
        const loggedInUserId = req.user._id;

        const me = await User.findById(loggedInUserId)
            .select("friends")
            .populate("friends", "-password");

        res.status(200).json(me.friends);
    } catch (error) {
        console.log("error in getUsersForSidebar:", error.message);
        res.status(500).json({ message: "internal server error" });
    }
};

export const getMessages = async (req, res) => {
    try {
        const { id: userToChatId } = req.params
        const myId = req.user._id;

        // Friend guard — only friends can read each other's DMs
        const me = await User.findById(myId).select("friends");
        const isFriend = me.friends.some(
            (fId) => fId.toString() === userToChatId
        );
        if (!isFriend) {
            return res.status(403).json({ message: "You can only chat with friends" });
        }

        const message = await Message.find({
            $or: [
                { senderId: myId, reciverId: userToChatId },
                { senderId: userToChatId, reciverId: myId }
            ]
        })

        res.status(200).json(message);

    } catch (error) {
        console.log("error in getMessages controller:", error.message);
        res.status(500).json({ message: "internal server error" });
    }
};

export const sendMessages = async (req, res) => {
    try {
        const { text, image, iv, isEncrypted } = req.body;
        const { id: reciverId } = req.params;
        const senderId = req.user._id;

        // Friend guard — only friends can send each other DMs
        const me = await User.findById(senderId).select("friends");
        const isFriend = me.friends.some(
            (fId) => fId.toString() === reciverId
        );
        if (!isFriend) {
            return res.status(403).json({ message: "You can only chat with friends" });
        }

        let imageUrl;
        if (image) {
            //upload base64 image to cloudinary
            const uploadResponse = await cloudinary.uploader.upload(image);
            imageUrl = uploadResponse.secure_url;
        }

        const newMessage = new Message({
            senderId,
            reciverId,
            text,
            image: imageUrl,
            iv: iv || null,
            isEncrypted: isEncrypted || false,
        });

        await newMessage.save();

        //realtime message functionality 
        const receiverSocketId = getReceiverSocketId(reciverId);
        if (receiverSocketId) {
            io.to(receiverSocketId).emit("newMessage", newMessage);
        }

        res.status(201).json(newMessage);
    }
    catch (error) {
        console.log("error in sendMessages controller:", error.message);
        res.status(500).json({ message: "internal server error" });
    }
}