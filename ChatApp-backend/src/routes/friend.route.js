import express from "express";
import { protectRoute } from "../middleware/auth.middleware.js";
import {
  sendFriendRequest,
  acceptFriendRequest,
  rejectFriendRequest,
  cancelFriendRequest,
  getFriendRequests,
  getSentRequests,
  getFriends,
  removeFriend,
  searchUsers,
} from "../controllers/friend.controller.js";

const router = express.Router();

// Search users
router.get("/search", protectRoute, searchUsers);

// Friend list
router.get("/", protectRoute, getFriends);

// Incoming requests
router.get("/requests", protectRoute, getFriendRequests);

// Sent requests
router.get("/sent", protectRoute, getSentRequests);

// Send request to a user
router.post("/request/:userId", protectRoute, sendFriendRequest);

// Accept a request
router.put("/accept/:requestId", protectRoute, acceptFriendRequest);

// Reject a request
router.put("/reject/:requestId", protectRoute, rejectFriendRequest);

// Cancel a sent request
router.delete("/cancel/:requestId", protectRoute, cancelFriendRequest);

// Remove a friend
router.delete("/:userId", protectRoute, removeFriend);

export default router;
