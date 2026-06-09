import Group from "../models/group.model.js";
import GroupMessage from "../models/groupMessage.model.js";
import cloudinary from "../lib/cloudinary.js";
import { io, getReceiverSocketId } from "../lib/socket.js";

// Create a new group
export const createGroup = async (req, res) => {
  try {
    const { name, description, avatar } = req.body;
    const adminId = req.user._id;

    if (!name || name.trim() === "") {
      return res.status(400).json({ message: "Group name is required" });
    }

    let avatarUrl = "";
    if (avatar) {
      const upload = await cloudinary.uploader.upload(avatar);
      avatarUrl = upload.secure_url;
    }

    const group = await Group.create({
      name: name.trim(),
      description: description?.trim() || "",
      avatar: avatarUrl,
      admin: adminId,
      members: [adminId],
    });

    const populated = await Group.findById(group._id)
      .populate("admin", "-password")
      .populate("members", "-password");

    res.status(201).json(populated);
  } catch (error) {
    console.log("error in createGroup:", error.message);
    res.status(500).json({ message: "Internal server error" });
  }
};

// Get all public groups
export const getAllGroups = async (req, res) => {
  try {
    const groups = await Group.find()
      .populate("admin", "-password")
      .populate("members", "-password")
      .sort({ createdAt: -1 });

    res.status(200).json(groups);
  } catch (error) {
    console.log("error in getAllGroups:", error.message);
    res.status(500).json({ message: "Internal server error" });
  }
};

// Get groups the logged-in user is a member of
export const getMyGroups = async (req, res) => {
  try {
    const myId = req.user._id;

    const groups = await Group.find({ members: myId })
      .populate("admin", "-password")
      .populate("members", "-password")
      .sort({ updatedAt: -1 });

    res.status(200).json(groups);
  } catch (error) {
    console.log("error in getMyGroups:", error.message);
    res.status(500).json({ message: "Internal server error" });
  }
};

// Join a group
export const joinGroup = async (req, res) => {
  try {
    const { groupId } = req.params;
    const myId = req.user._id;

    const group = await Group.findById(groupId);
    if (!group) return res.status(404).json({ message: "Group not found" });

    const alreadyMember = group.members.some(
      (m) => m.toString() === myId.toString()
    );
    if (alreadyMember) {
      return res.status(400).json({ message: "Already a member" });
    }

    group.members.push(myId);
    await group.save();

    const populated = await Group.findById(groupId)
      .populate("admin", "-password")
      .populate("members", "-password");

    // Notify all current members
    group.members.forEach((memberId) => {
      const socketId = getReceiverSocketId(memberId.toString());
      if (socketId) {
        io.to(socketId).emit("userJoinedGroup", {
          groupId,
          user: req.user,
        });
      }
    });

    res.status(200).json(populated);
  } catch (error) {
    console.log("error in joinGroup:", error.message);
    res.status(500).json({ message: "Internal server error" });
  }
};

// Leave a group
export const leaveGroup = async (req, res) => {
  try {
    const { groupId } = req.params;
    const myId = req.user._id;

    const group = await Group.findById(groupId);
    if (!group) return res.status(404).json({ message: "Group not found" });

    const isMember = group.members.some(
      (m) => m.toString() === myId.toString()
    );
    if (!isMember) {
      return res.status(400).json({ message: "Not a member" });
    }

    group.members = group.members.filter(
      (m) => m.toString() !== myId.toString()
    );

    // If no members left, delete the group
    if (group.members.length === 0) {
      await Group.findByIdAndDelete(groupId);
      await GroupMessage.deleteMany({ groupId });
      return res.status(200).json({ message: "Group deleted (no members left)" });
    }

    // If admin left, transfer admin to first remaining member
    if (group.admin.toString() === myId.toString()) {
      group.admin = group.members[0];
    }

    await group.save();

    // Notify remaining members
    group.members.forEach((memberId) => {
      const socketId = getReceiverSocketId(memberId.toString());
      if (socketId) {
        io.to(socketId).emit("userLeftGroup", {
          groupId,
          userId: myId,
        });
      }
    });

    res.status(200).json({ message: "Left group successfully" });
  } catch (error) {
    console.log("error in leaveGroup:", error.message);
    res.status(500).json({ message: "Internal server error" });
  }
};

// Get group messages
export const getGroupMessages = async (req, res) => {
  try {
    const { groupId } = req.params;
    const myId = req.user._id;

    const group = await Group.findById(groupId);
    if (!group) return res.status(404).json({ message: "Group not found" });

    const isMember = group.members.some(
      (m) => m.toString() === myId.toString()
    );
    if (!isMember) {
      return res.status(403).json({ message: "You are not a member of this group" });
    }

    const messages = await GroupMessage.find({ groupId })
      .populate("senderId", "-password") // publicKey is included (not password-excluded)
      .sort({ createdAt: 1 });

    res.status(200).json(messages);
  } catch (error) {
    console.log("error in getGroupMessages:", error.message);
    res.status(500).json({ message: "Internal server error" });
  }
};

// Send a group message
export const sendGroupMessage = async (req, res) => {
  try {
    const { groupId } = req.params;
    const { text, image, iv, isEncrypted } = req.body;
    const senderId = req.user._id;

    const group = await Group.findById(groupId);
    if (!group) return res.status(404).json({ message: "Group not found" });

    const isMember = group.members.some(
      (m) => m.toString() === senderId.toString()
    );
    if (!isMember) {
      return res.status(403).json({ message: "You are not a member of this group" });
    }

    let imageUrl;
    if (image) {
      const upload = await cloudinary.uploader.upload(image);
      imageUrl = upload.secure_url;
    }

    const message = await GroupMessage.create({
      groupId,
      senderId,
      text,
      image: imageUrl,
      iv: iv || null,
      isEncrypted: isEncrypted || false,
    });

    const populated = await GroupMessage.findById(message._id).populate(
      "senderId",
      "-password"
    );

    // Emit to all group members
    group.members.forEach((memberId) => {
      const socketId = getReceiverSocketId(memberId.toString());
      if (socketId) {
        io.to(socketId).emit("newGroupMessage", populated);
      }
    });

    res.status(201).json(populated);
  } catch (error) {
    console.log("error in sendGroupMessage:", error.message);
    res.status(500).json({ message: "Internal server error" });
  }
};

// Delete a group (admin only)
export const deleteGroup = async (req, res) => {
  try {
    const { groupId } = req.params;
    const myId = req.user._id;

    const group = await Group.findById(groupId);
    if (!group) return res.status(404).json({ message: "Group not found" });

    if (group.admin.toString() !== myId.toString()) {
      return res.status(403).json({ message: "Only the admin can delete this group" });
    }

    await Group.findByIdAndDelete(groupId);
    await GroupMessage.deleteMany({ groupId });

    res.status(200).json({ message: "Group deleted successfully" });
  } catch (error) {
    console.log("error in deleteGroup:", error.message);
    res.status(500).json({ message: "Internal server error" });
  }
};
