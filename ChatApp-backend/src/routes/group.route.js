import express from "express";
import { protectRoute } from "../middleware/auth.middleware.js";
import {
  createGroup,
  getAllGroups,
  getMyGroups,
  joinGroup,
  leaveGroup,
  getGroupMessages,
  sendGroupMessage,
  deleteGroup,
  getMembersKeys,
  distributeKey,
  getPendingKeys,
} from "../controllers/group.controller.js";

const router = express.Router();

// Get all public groups (discovery)
router.get("/", protectRoute, getAllGroups);

// Get groups I belong to
router.get("/mine", protectRoute, getMyGroups);

// Create a group
router.post("/", protectRoute, createGroup);

// Join a group
router.post("/:groupId/join", protectRoute, joinGroup);

// Leave a group
router.post("/:groupId/leave", protectRoute, leaveGroup);

// Group messages
router.get("/:groupId/messages", protectRoute, getGroupMessages);
router.post("/:groupId/messages", protectRoute, sendGroupMessage);

// Delete a group (admin only)
router.delete("/:groupId", protectRoute, deleteGroup);

// ── E2EE Key Distribution ─────────────────────────────────────────────────
// Get public keys of all members (so sender can wrap their Sender Key)
router.get("/:groupId/members-keys", protectRoute, getMembersKeys);
// Upload wrapped sender keys for all recipients
router.post("/:groupId/distribute-key", protectRoute, distributeKey);
// Fetch undelivered wrapped keys addressed to me
router.get("/:groupId/pending-keys", protectRoute, getPendingKeys);

export default router;
