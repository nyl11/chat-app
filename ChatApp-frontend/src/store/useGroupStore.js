import { create } from "zustand";
import toast from "react-hot-toast";
import { axiosInstance } from "../lib/axios";
import { useAuthStore } from "./useAuthStore";
import {
  getOrCreateKeyPair,
  getSharedKey,
  encryptMessage,
  decryptMessage,
} from "../lib/crypto";

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
      const res = await axiosInstance.get("/groups");
      set({ allGroups: res.data });
    } catch (error) {
      toast.error(error.response?.data?.message || "Failed to fetch groups");
    } finally {
      set({ isLoadingGroups: false });
    }
  },

  fetchMyGroups: async () => {
    try {
      const res = await axiosInstance.get("/groups/mine");
      set({ myGroups: res.data });
    } catch (error) {
      toast.error(error.response?.data?.message || "Failed to fetch your groups");
    }
  },

  getGroupMessages: async (groupId) => {
    set({ isLoadingMessages: true });
    try {
      const res = await axiosInstance.get(`/groups/${groupId}/messages`);
      const myUser = useAuthStore.getState().authUser;
      const myKeyPair = await getOrCreateKeyPair(myUser._id);

      // Decrypt each message using the AES key derived from sender's public key
      const decrypted = await Promise.all(
        res.data.map(async (msg) => {
          if (!msg.isEncrypted || !msg.iv) return msg; // old plaintext — skip
          try {
            // Sender's public key is embedded in the populated senderId object
            const senderPublicKeyBase64 = msg.senderId?.publicKey;
            if (!senderPublicKeyBase64) return msg;

            // If I am the sender, use my own public key to derive the key
            // Both sides derive the same key: ECDH(myPrivate, theirPublic)
            const otherUserId =
              msg.senderId._id === myUser._id
                ? myUser._id
                : msg.senderId._id;
            const otherPublicKeyBase64 =
              msg.senderId._id === myUser._id
                ? await (async () => {
                    const { publicKey } = await getOrCreateKeyPair(myUser._id);
                    const { exportPublicKey } = await import("../lib/crypto");
                    return exportPublicKey(publicKey);
                  })()
                : senderPublicKeyBase64;

            const aesKey = await getSharedKey(
              myKeyPair.privateKey,
              otherUserId,
              otherPublicKeyBase64
            );
            const plaintext = await decryptMessage(aesKey, msg.iv, msg.text);
            return { ...msg, text: plaintext };
          } catch {
            return { ...msg, text: "[🔒 Decryption failed]" };
          }
        })
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
      const res = await axiosInstance.post("/groups", data);
      toast.success("Group created!");
      set((state) => ({
        myGroups: [res.data, ...state.myGroups],
        allGroups: [res.data, ...state.allGroups],
      }));
      return res.data;
    } catch (error) {
      toast.error(error.response?.data?.message || "Failed to create group");
      return null;
    }
  },

  joinGroup: async (groupId) => {
    try {
      const res = await axiosInstance.post(`/groups/${groupId}/join`);
      toast.success("Joined group!");
      set((state) => ({
        myGroups: [res.data, ...state.myGroups],
        allGroups: state.allGroups.map((g) =>
          g._id === groupId ? res.data : g
        ),
      }));
    } catch (error) {
      toast.error(error.response?.data?.message || "Failed to join group");
    }
  },

  leaveGroup: async (groupId) => {
    try {
      await axiosInstance.post(`/groups/${groupId}/leave`);
      toast.success("Left group");
      set((state) => ({
        myGroups: state.myGroups.filter((g) => g._id !== groupId),
        selectedGroup:
          state.selectedGroup?._id === groupId ? null : state.selectedGroup,
        groupMessages:
          state.selectedGroup?._id === groupId ? [] : state.groupMessages,
      }));
    } catch (error) {
      toast.error(error.response?.data?.message || "Failed to leave group");
    }
  },

  deleteGroup: async (groupId) => {
    try {
      await axiosInstance.delete(`/groups/${groupId}`);
      toast.success("Group deleted");
      set((state) => ({
        myGroups: state.myGroups.filter((g) => g._id !== groupId),
        allGroups: state.allGroups.filter((g) => g._id !== groupId),
        selectedGroup:
          state.selectedGroup?._id === groupId ? null : state.selectedGroup,
        groupMessages:
          state.selectedGroup?._id === groupId ? [] : state.groupMessages,
      }));
    } catch (error) {
      toast.error(error.response?.data?.message || "Failed to delete group");
    }
  },

  sendGroupMessage: async (messageData) => {
    const { selectedGroup, groupMessages } = get();
    const myUser = useAuthStore.getState().authUser;
    try {
      let payload = { ...messageData };

      if (messageData.text) {
        // For group messages: encrypt with a key derived from our OWN key pair
        // (using our public key as the "other" side — a self-derived AES key)
        // Recipients decrypt by fetching the sender's public key
        const myKeyPair = await getOrCreateKeyPair(myUser._id);
        const { exportPublicKey } = await import("../lib/crypto");
        const myPublicKeyBase64 = await exportPublicKey(myKeyPair.publicKey);
        const aesKey = await getSharedKey(
          myKeyPair.privateKey,
          myUser._id,
          myPublicKeyBase64
        );
        const { iv, ciphertext } = await encryptMessage(aesKey, messageData.text);
        payload.text = ciphertext;
        payload.iv = iv;
        payload.isEncrypted = true;
      }

      const res = await axiosInstance.post(
        `/groups/${selectedGroup._id}/messages`,
        payload
      );

      // Show the sender their own plaintext immediately
      const displayMessage = payload.isEncrypted
        ? { ...res.data, text: messageData.text }
        : res.data;

      set({ groupMessages: [...groupMessages, displayMessage] });
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

      // Decrypt incoming group message if encrypted
      let displayMessage = message;
      if (message.isEncrypted && message.iv && message.senderId) {
        try {
          const myUser = useAuthStore.getState().authUser;
          const myKeyPair = await getOrCreateKeyPair(myUser._id);

          // The sender's public key comes embedded in the populated senderId
          const senderPublicKeyBase64 = message.senderId?.publicKey;
          if (senderPublicKeyBase64) {
            const aesKey = await getSharedKey(
              myKeyPair.privateKey,
              message.senderId._id,
              senderPublicKeyBase64
            );
            const plaintext = await decryptMessage(aesKey, message.iv, message.text);
            displayMessage = { ...message, text: plaintext };
          }
        } catch {
          displayMessage = { ...message, text: "[🔒 Decryption failed]" };
        }
      }

      set({ groupMessages: [...get().groupMessages, displayMessage] });
    });

    socket.on("userJoinedGroup", ({ groupId }) => {
      if (groupId === selectedGroup?._id) {
        // Refresh the group to update member count
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
  },

  unsubscribeFromGroupMessages: () => {
    const socket = useAuthStore.getState().socket;
    if (!socket) return;
    socket.off("newGroupMessage");
    socket.off("userJoinedGroup");
    socket.off("userLeftGroup");
  },
}));
