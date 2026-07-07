import { create } from "zustand";
import toast from "react-hot-toast";
import { useAuthStore } from "./useAuthStore";
import { fetchUsersApi, fetchMessagesApi, sendMessageApi } from "../api/dmApi";
import {
  getDMSharedSecret,
  encryptDMMessage,
  tryDecryptDMMessage,
} from "../lib/dmCryptoOps";

// ─── Store ─────────────────────────────────────────────────────────────────

export const useChatStore = create((set, get) => ({
  messages: [],
  users: [],
  selectedUser: null,
  isUsersLoading: false,
  isMessagesLoading: false,

  // ─── Fetch sidebar users ──────────────────────────────────────────────────

  getUser: async () => {
    set({ isUsersLoading: true });
    try {
      const data = await fetchUsersApi();
      set({ users: data });
    } catch (error) {
      toast.error(error.response?.data?.message || "Failed to fetch friends");
    } finally {
      set({ isUsersLoading: false });
    }
  },

  // ─── Fetch + decrypt messages for a conversation ─────────────────────────

  getMessages: async (userId) => {
    set({ isMessagesLoading: true });
    try {
      const authUser = useAuthStore.getState().authUser;

      // Derive the shared secret once for all messages in this conversation
      const sharedSecret = await getDMSharedSecret(authUser, userId);

      const raw = await fetchMessagesApi(userId);

      const decrypted = raw.map((msg) => tryDecryptDMMessage(msg, sharedSecret));

      set({ messages: decrypted });
    } catch (error) {
      toast.error(error.response?.data?.message || "Failed to fetch messages");
    } finally {
      set({ isMessagesLoading: false });
    }
  },

  // ─── Send (encrypt then post) a message ──────────────────────────────────

  sendMessage: async (messageData) => {
    const { selectedUser, messages } = get();
    const authUser = useAuthStore.getState().authUser;

    try {
      let payload = { ...messageData };

      // Only encrypt text — images are not encrypted in this implementation
      if (messageData.text) {
        const sharedSecret = await getDMSharedSecret(authUser, selectedUser._id);

        if (sharedSecret) {
          // Replaces text with ciphertext and adds iv, mac, isEncrypted
          payload = {
            ...payload,
            ...encryptDMMessage(sharedSecret, messageData.text),
          };
        } else {
          console.warn("[DM E2EE] Peer has no key — sending as plaintext");
        }
      }

      const saved = await sendMessageApi(selectedUser._id, payload);

      // Optimistic display: show the original plaintext, not the ciphertext
      const displayMsg = payload.isEncrypted
        ? { ...saved, text: messageData.text }
        : saved;

      set({ messages: [...messages, displayMsg] });
    } catch (error) {
      toast.error(error.response?.data?.message || "Failed to send message");
    }
  },

  // ─── Real-time socket subscription ───────────────────────────────────────

  subscribeToMessage: () => {
    const { selectedUser } = get();
    if (!selectedUser) return;

    const socket = useAuthStore.getState().socket;
    const authUser = useAuthStore.getState().authUser;

    socket.on("newMessage", async (newMessage) => {
      // Only handle messages for the currently open conversation
      if (newMessage.senderId !== selectedUser._id) return;

      // Derive secret (cached — no extra network round-trip after first time)
      const sharedSecret = await getDMSharedSecret(authUser, selectedUser._id);
      const displayMsg = tryDecryptDMMessage(newMessage, sharedSecret);

      // Guard: skip if sender already added optimistically
      const alreadyExists = get().messages.some((m) => m._id === displayMsg._id);
      if (!alreadyExists) {
        set({ messages: [...get().messages, displayMsg] });
      }
    });
  },

  unsubscribeFromMessage: () => {
    const socket = useAuthStore.getState().socket;
    socket.off("newMessage");
  },

  setSelectedUser: (selectedUser) => set({ selectedUser }),
}));
