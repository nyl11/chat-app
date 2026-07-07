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
} from "../api/groupApi";
import {
  tryDecryptMessage,
  buildEncryptedPayload,
  fetchAndStoreKeys,
  distributeOurSenderKey,
} from "../lib/groupCryptoOps";
import { getOrCreateSenderKey } from "../lib/cryptoEngine";

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
    const { selectedGroup, groupMessages } = get();
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

      set({ groupMessages: [...groupMessages, displayMsg] });
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

    socket.on("newGroupMessage", async (message) => {
      if (message.groupId !== selectedGroup._id) return;

      const alreadyExists = get().groupMessages.some((m) => m._id === message._id);
      if (alreadyExists) return;

      const decrypted = await tryDecryptMessage({
        ...message,
        groupId: message.groupId,
      });
      set({ groupMessages: [...get().groupMessages, decrypted] });
    });

    socket.on("userJoinedGroup", ({ groupId }) => {
      if (groupId === selectedGroup?._id) {
        get().fetchMyGroups();
        get().fetchAllGroups();
      }
    });

    socket.on("userLeftGroup", ({ groupId }) => {
      if (groupId === selectedGroup?._id) {
        get().fetchMyGroups();
        get().fetchAllGroups();
      }
    });

    // Re-decrypt messages that failed due to a missing key.
    // Re-attempt ALL locked/failed messages (not just from a specific sender)
    // to avoid brittle senderId string-vs-ObjectId comparison issues.
    socket.on("newSenderKeyDistributed", async ({ groupId }) => {
      if (groupId !== selectedGroup?._id) return;
      await get().fetchAndStorePendingKeys(groupId);

      const updated = await Promise.all(
        get().groupMessages.map((m) => {
          const isPending =
            m.text === "🔒 [key not yet received]" ||
            m.text === "⚠️ [decryption failed]";
          if (m.isEncrypted && isPending) {
            return tryDecryptMessage(m);
          }
          return m;
        })
      );
      set({ groupMessages: updated });
    });
  },

  unsubscribeFromGroupMessages: () => {
    const socket = useAuthStore.getState().socket;
    if (!socket) return;
    socket.off("newGroupMessage");
    socket.off("userJoinedGroup");
    socket.off("userLeftGroup");
    socket.off("newSenderKeyDistributed");
  },
}));
