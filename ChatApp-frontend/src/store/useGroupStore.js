import { create } from "zustand";
import toast from "react-hot-toast";
import { useAuthStore } from "./useAuthStore";
import {
  fetchAllGroupsApi,
  fetchMyGroupsApi,
  fetchGroupMessagesApi,
  sendGroupMessageApi,
  createGroupApi,
  joinGroupApi,
  leaveGroupApi,
  deleteGroupApi,
  publishPublicKeyApi,
} from "../api/groupApi";
import {
  tryDecryptMessage,
  buildEncryptedPayload,
  fetchAndStoreKeys,
  distributeOurSenderKey,
} from "../lib/groupCryptoOps";
import { getOrCreateSenderKey, getOrCreateGroupKeyPair } from "../lib/cryptoEngine";

// ─── Helper: re-attempt decryption of locked messages already in state ──────
// Called after a new sender key is stored so any previously locked messages
// from that sender are decrypted without requiring a full message reload.
async function retryLockedMessages(get, set, groupId) {
  const messages = get().groupMessages;
  const locked = messages.filter(
    (m) =>
      m.isEncrypted &&
      (m.text === "🔒 [key not yet received]" || m.text === "⚠️ [decryption failed]")
  );
  if (locked.length === 0) return;
  const updated = await Promise.all(
    messages.map((m) => {
      const isPending =
        m.isEncrypted &&
        (m.text === "🔒 [key not yet received]" || m.text === "⚠️ [decryption failed]");
      return isPending ? tryDecryptMessage(m) : m;
    })
  );
  set({ groupMessages: updated });
}

// ─── Helper: attempt decryption with up to `attempts` retries spaced `ms` ms ─
// Used in the newGroupMessage socket handler to tolerate the race between
// key-distribution and message-delivery socket events.
async function decryptWithRetry(msg, attempts = 4, delayMs = 600) {
  for (let i = 0; i < attempts; i++) {
    const result = await tryDecryptMessage(msg);
    if (
      result.text !== "🔒 [key not yet received]" &&
      result.text !== "⚠️ [decryption failed]"
    ) {
      return result;
    }
    if (i < attempts - 1) {
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
  // Return the best attempt (may still be locked — will be re-tried on newSenderKeyDistributed)
  return tryDecryptMessage(msg);
}

// ─── Store ─────────────────────────────────────────────────────────────────

export const useGroupStore = create((set, get) => ({
  allGroups: [],
  myGroups: [],
  selectedGroup: null,
  groupMessages: [],
  isLoadingGroups: false,
  isLoadingMessages: false,

  // --- Fetch ---

  fetchAllGroups: async () => {
    set({ isLoadingGroups: true });
    try {
      const data = await fetchAllGroupsApi();
      set({ allGroups: data });
    } catch (error) {
      toast.error(error.response?.data?.message || "Failed to fetch groups");
    } finally {
      set({ isLoadingGroups: false });
    }
  },

  fetchMyGroups: async () => {
    try {
      const data = await fetchMyGroupsApi();
      set({ myGroups: data });
    } catch (error) {
      toast.error(error.response?.data?.message || "Failed to fetch your groups");
    }
  },

  /**
   * Fetch and persist any pending Sender Keys for this group so older
   * messages can be decrypted. Called every time a group is opened.
   */
  fetchAndStorePendingKeys: async (groupId) => {
    const authUser = useAuthStore.getState().authUser;
    if (!authUser) return;
    try {
      await fetchAndStoreKeys(authUser, groupId);
    } catch (e) {
      console.warn("[E2EE] fetchAndStorePendingKeys error:", e.message);
    }
  },

  /**
   * Distribute our Sender Key to all group members (or a specific list).
   * Called before the first message in a group and when new members join.
   */
  distributeSenderKey: async (groupId, recipientList) => {
    const authUser = useAuthStore.getState().authUser;
    if (!authUser) return;
    try {
      await distributeOurSenderKey(authUser, groupId, recipientList);
    } catch (e) {
      console.warn("[E2EE] distributeSenderKey error:", e.message);
    }
  },

  getGroupMessages: async (groupId) => {
    set({ isLoadingMessages: true });
    try {
      await get().fetchAndStorePendingKeys(groupId);
      // Proactively distribute our sender key so other/new members have it
      get().distributeSenderKey(groupId);
      // Ask online group members to distribute their keys if needed
      get().requestGroupKeys(groupId);

      const raw = await fetchGroupMessagesApi(groupId);
      const decrypted = await Promise.all(
        raw.map((msg) => tryDecryptMessage({ ...msg, groupId }))
      );
      set({ groupMessages: decrypted });
    } catch (error) {
      toast.error(error.response?.data?.message || "Failed to fetch messages");
    } finally {
      set({ isLoadingMessages: false });
    }
  },

  // --- Actions ---

  createGroup: async (data) => {
    try {
      const group = await createGroupApi(data);
      toast.success("Group created!");
      set((state) => ({
        myGroups: [group, ...state.myGroups],
        allGroups: [group, ...state.allGroups],
      }));

      // Fix #1: Publish our public key immediately so other members who join
      // can verify and unwrap any sender keys we distribute to them.
      const authUser = useAuthStore.getState().authUser;
      if (authUser) {
        try {
          const { publicKeyB64 } = await getOrCreateGroupKeyPair(authUser._id);
          await publishPublicKeyApi(publicKeyB64);
        } catch (e) {
          console.warn("[E2EE] Could not publish public key after createGroup:", e.message);
        }
      }

      return group;
    } catch (error) {
      toast.error(error.response?.data?.message || "Failed to create group");
      return null;
    }
  },

  joinGroup: async (groupId) => {
    try {
      const group = await joinGroupApi(groupId);
      toast.success("Joined group!");
      set((state) => ({
        myGroups: [group, ...state.myGroups],
        allGroups: state.allGroups.map((g) => (g._id === groupId ? group : g)),
      }));
      // Distribute our key to existing members and fetch theirs
      await get().distributeSenderKey(groupId);
      await get().fetchAndStorePendingKeys(groupId);
    } catch (error) {
      toast.error(error.response?.data?.message || "Failed to join group");
    }
  },

  leaveGroup: async (groupId) => {
    try {
      await leaveGroupApi(groupId);
      toast.success("Left group");
      set((state) => ({
        myGroups: state.myGroups.filter((g) => g._id !== groupId),
        selectedGroup: state.selectedGroup?._id === groupId ? null : state.selectedGroup,
        groupMessages: state.selectedGroup?._id === groupId ? [] : state.groupMessages,
      }));
    } catch (error) {
      toast.error(error.response?.data?.message || "Failed to leave group");
    }
  },

  deleteGroup: async (groupId) => {
    try {
      await deleteGroupApi(groupId);
      toast.success("Group deleted");
      set((state) => ({
        myGroups: state.myGroups.filter((g) => g._id !== groupId),
        allGroups: state.allGroups.filter((g) => g._id !== groupId),
        selectedGroup: state.selectedGroup?._id === groupId ? null : state.selectedGroup,
        groupMessages: state.selectedGroup?._id === groupId ? [] : state.groupMessages,
      }));
    } catch (error) {
      toast.error(error.response?.data?.message || "Failed to delete group");
    }
  },

  sendGroupMessage: async (messageData) => {
    const { selectedGroup } = get();
    const authUser = useAuthStore.getState().authUser;
    if (!authUser || !selectedGroup) return;

    try {
      const groupId = selectedGroup._id;
      const senderKey = await getOrCreateSenderKey(authUser._id, groupId);

      // Always attempt to distribute (server upserts idempotently)
      await get().distributeSenderKey(groupId);

      const payload = buildEncryptedPayload(senderKey, messageData);
      const saved = await sendGroupMessageApi(groupId, payload);

      // Use the plaintext for immediate display
      const displayMsg = messageData.text
        ? { ...saved, text: messageData.text, groupId }
        : { ...saved, groupId };

      set((state) => {
        const exists = state.groupMessages.some((m) => m._id === displayMsg._id);
        if (exists) return state;
        return { groupMessages: [...state.groupMessages, displayMsg] };
      });
    } catch (error) {
      toast.error(error.response?.data?.message || "Failed to send message");
    }
  },

  setSelectedGroup: (group) => set({ selectedGroup: group, groupMessages: [] }),

  // --- Real-time socket subscriptions ---

  subscribeToGroupMessages: () => {
    const { selectedGroup } = get();
    if (!selectedGroup) return;
    const socket = useAuthStore.getState().socket;
    if (!socket) return;

    // Prevent duplicate listeners
    get().unsubscribeFromGroupMessages();

    socket.on("newGroupMessage", async (message) => {
      const currentGroup = get().selectedGroup;
      if (!currentGroup || message.groupId !== currentGroup._id) return;

      // Sender already has their own message added in sendGroupMessage
      const authUser = useAuthStore.getState().authUser;
      const senderIdStr = (message.senderId?._id || message.senderId)?.toString();
      if (authUser && senderIdStr === authUser._id?.toString()) return;

      const alreadyExists = get().groupMessages.some((m) => m._id === message._id);
      if (alreadyExists) return;

      // Fix #2: Use retry-with-backoff to tolerate the race between
      // newSenderKeyDistributed and newGroupMessage socket events.
      // The key distribution POST completes before the message POST on the
      // sender side, but socket delivery order is not guaranteed on the
      // recipient side — the key store write (HTTP + unwrap + IndexedDB)
      // may not be done when the message arrives.
      const msgWithGroup = { ...message, groupId: message.groupId };
      const decrypted = await decryptWithRetry(msgWithGroup);

      set((state) => {
        const exists = state.groupMessages.some((m) => m._id === decrypted._id);
        if (exists) return state;
        return { groupMessages: [...state.groupMessages, decrypted] };
      });
    });

    socket.on("userJoinedGroup", async ({ groupId }) => {
      const current = get().selectedGroup;
      if (groupId === current?._id) {
        get().fetchMyGroups();
        get().fetchAllGroups();
        // Immediately share our sender key with the new member
        await get().distributeSenderKey(groupId);
      }
    });

    socket.on("userLeftGroup", ({ groupId }) => {
      if (groupId === selectedGroup?._id) {
        get().fetchMyGroups();
        get().fetchAllGroups();
      }
    });

    // When another member requests keys for this group, share our key
    socket.on("requestGroupKeys", async ({ groupId }) => {
      const current = get().selectedGroup;
      if (groupId === current?._id) {
        await get().distributeSenderKey(groupId);
      }
    });

    // Fix #4: Re-decrypt ALL locked messages when a new sender key arrives.
    // Also handles the case where newGroupMessage arrived AFTER
    // newSenderKeyDistributed (event reordering) — those messages were
    // appended locked and need another pass once the key is confirmed stored.
    socket.on("newSenderKeyDistributed", async ({ groupId }) => {
      if (groupId !== selectedGroup?._id) return;
      await get().fetchAndStorePendingKeys(groupId);
      await retryLockedMessages(get, set, groupId);
    });
  },

  requestGroupKeys: (groupId) => {
    const socket = useAuthStore.getState().socket;
    if (!socket) return;
    socket.emit("requestGroupKeys", { groupId });
  },

  unsubscribeFromGroupMessages: () => {
    const socket = useAuthStore.getState().socket;
    if (!socket) return;
    socket.off("newGroupMessage");
    socket.off("userJoinedGroup");
    socket.off("userLeftGroup");
    socket.off("requestGroupKeys");
    socket.off("newSenderKeyDistributed");
  },
}));
