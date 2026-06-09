import User from "../models/user.model.js";
import FriendRequest from "../models/friendRequest.model.js";
import { getReceiverSocketId, io } from "../lib/socket.js";

// Search all users (excluding self)
export const searchUsers = async (req, res) => {
  try {
    const { q } = req.query;
    const myId = req.user._id;

    if (!q || q.trim() === "") {
      return res.status(400).json({ message: "Search query is required" });
    }

    const regex = new RegExp(q.trim(), "i");
    const users = await User.find({
      _id: { $ne: myId },
      $or: [{ fullName: regex }, { email: regex }],
    }).select("-password").limit(20);

    // Attach friendship status for each result
    const myFriendRequests = await FriendRequest.find({
      $or: [{ senderId: myId }, { receiverId: myId }],
    });

    const meUser = await User.findById(myId).select("friends");

    const enriched = users.map((user) => {
      const isFriend = meUser.friends.some(
        (fId) => fId.toString() === user._id.toString()
      );

      const outgoing = myFriendRequests.find(
        (r) =>
          r.senderId.toString() === myId.toString() &&
          r.receiverId.toString() === user._id.toString() &&
          r.status === "pending"
      );

      const incoming = myFriendRequests.find(
        (r) =>
          r.receiverId.toString() === myId.toString() &&
          r.senderId.toString() === user._id.toString() &&
          r.status === "pending"
      );

      let friendStatus = "none";
      if (isFriend) friendStatus = "friends";
      else if (outgoing) friendStatus = "sent";
      else if (incoming) friendStatus = "received";

      return { ...user.toObject(), friendStatus, requestId: outgoing?._id || incoming?._id || null };
    });

    res.status(200).json(enriched);
  } catch (error) {
    console.log("error in searchUsers:", error.message);
    res.status(500).json({ message: "Internal server error" });
  }
};

// Send a friend request
export const sendFriendRequest = async (req, res) => {
  try {
    const senderId = req.user._id;
    const { userId: receiverId } = req.params;

    if (senderId.toString() === receiverId) {
      return res.status(400).json({ message: "You cannot add yourself" });
    }

    // Check if already friends
    const me = await User.findById(senderId).select("friends");
    if (me.friends.some((f) => f.toString() === receiverId)) {
      return res.status(400).json({ message: "Already friends" });
    }

    // Check if a request already exists
    const existing = await FriendRequest.findOne({
      $or: [
        { senderId, receiverId },
        { senderId: receiverId, receiverId: senderId },
      ],
      status: "pending",
    });

    if (existing) {
      return res.status(400).json({ message: "Friend request already exists" });
    }

    const request = await FriendRequest.create({ senderId, receiverId });

    // Real-time notification
    const receiverSocketId = getReceiverSocketId(receiverId);
    if (receiverSocketId) {
      const populatedRequest = await FriendRequest.findById(request._id).populate(
        "senderId",
        "-password"
      );
      io.to(receiverSocketId).emit("friendRequest", populatedRequest);
    }

    res.status(201).json({ message: "Friend request sent", request });
  } catch (error) {
    console.log("error in sendFriendRequest:", error.message);
    res.status(500).json({ message: "Internal server error" });
  }
};

// Accept a friend request
export const acceptFriendRequest = async (req, res) => {
  try {
    const { requestId } = req.params;
    const myId = req.user._id;

    const request = await FriendRequest.findById(requestId);
    if (!request) return res.status(404).json({ message: "Request not found" });

    if (request.receiverId.toString() !== myId.toString()) {
      return res.status(403).json({ message: "Not authorized" });
    }

    if (request.status !== "pending") {
      return res.status(400).json({ message: "Request already handled" });
    }

    request.status = "accepted";
    await request.save();

    // Add each user to the other's friends list
    await User.findByIdAndUpdate(myId, {
      $addToSet: { friends: request.senderId },
    });
    await User.findByIdAndUpdate(request.senderId, {
      $addToSet: { friends: myId },
    });

    // Notify the sender
    const senderSocketId = getReceiverSocketId(request.senderId.toString());
    if (senderSocketId) {
      const me = await User.findById(myId).select("-password");
      io.to(senderSocketId).emit("friendRequestAccepted", { request, acceptedBy: me });
    }

    res.status(200).json({ message: "Friend request accepted" });
  } catch (error) {
    console.log("error in acceptFriendRequest:", error.message);
    res.status(500).json({ message: "Internal server error" });
  }
};

// Reject a friend request
export const rejectFriendRequest = async (req, res) => {
  try {
    const { requestId } = req.params;
    const myId = req.user._id;

    const request = await FriendRequest.findById(requestId);
    if (!request) return res.status(404).json({ message: "Request not found" });

    if (request.receiverId.toString() !== myId.toString()) {
      return res.status(403).json({ message: "Not authorized" });
    }

    request.status = "rejected";
    await request.save();

    res.status(200).json({ message: "Friend request rejected" });
  } catch (error) {
    console.log("error in rejectFriendRequest:", error.message);
    res.status(500).json({ message: "Internal server error" });
  }
};

// Cancel a sent friend request (sender cancels)
export const cancelFriendRequest = async (req, res) => {
  try {
    const { requestId } = req.params;
    const myId = req.user._id;

    const request = await FriendRequest.findById(requestId);
    if (!request) return res.status(404).json({ message: "Request not found" });

    if (request.senderId.toString() !== myId.toString()) {
      return res.status(403).json({ message: "Not authorized" });
    }

    await FriendRequest.findByIdAndDelete(requestId);

    res.status(200).json({ message: "Friend request cancelled" });
  } catch (error) {
    console.log("error in cancelFriendRequest:", error.message);
    res.status(500).json({ message: "Internal server error" });
  }
};

// Get incoming pending friend requests
export const getFriendRequests = async (req, res) => {
  try {
    const myId = req.user._id;

    const requests = await FriendRequest.find({
      receiverId: myId,
      status: "pending",
    }).populate("senderId", "-password");

    res.status(200).json(requests);
  } catch (error) {
    console.log("error in getFriendRequests:", error.message);
    res.status(500).json({ message: "Internal server error" });
  }
};

// Get outgoing pending friend requests
export const getSentRequests = async (req, res) => {
  try {
    const myId = req.user._id;

    const requests = await FriendRequest.find({
      senderId: myId,
      status: "pending",
    }).populate("receiverId", "-password");

    res.status(200).json(requests);
  } catch (error) {
    console.log("error in getSentRequests:", error.message);
    res.status(500).json({ message: "Internal server error" });
  }
};

// Get accepted friends list
export const getFriends = async (req, res) => {
  try {
    const myId = req.user._id;

    const me = await User.findById(myId)
      .select("friends")
      .populate("friends", "-password");

    res.status(200).json(me.friends);
  } catch (error) {
    console.log("error in getFriends:", error.message);
    res.status(500).json({ message: "Internal server error" });
  }
};

// Remove a friend
export const removeFriend = async (req, res) => {
  try {
    const myId = req.user._id;
    const { userId: friendId } = req.params;

    await User.findByIdAndUpdate(myId, { $pull: { friends: friendId } });
    await User.findByIdAndUpdate(friendId, { $pull: { friends: myId } });

    // Clean up any accepted request doc
    await FriendRequest.deleteMany({
      $or: [
        { senderId: myId, receiverId: friendId },
        { senderId: friendId, receiverId: myId },
      ],
    });

    res.status(200).json({ message: "Friend removed" });
  } catch (error) {
    console.log("error in removeFriend:", error.message);
    res.status(500).json({ message: "Internal server error" });
  }
};
