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


// ─────────────────────────────────────────────────────────────
// Helper: decrypt a list of messages using the shared AES key
// with the other user. Skips any message that is not encrypted
// (backwards compatible with old plaintext messages).
// ─────────────────────────────────────────────────────────────

async function decryptMessages(messages, myPrivateKey, otherUserId, otherPublicKeyBase64) {
  if (!otherPublicKeyBase64) return messages; // other user has no key yet — skip

  const aesKey = await getSharedKey(myPrivateKey, otherUserId, otherPublicKeyBase64);

  return Promise.all(
    messages.map(async (msg) => {
      if (!msg.isEncrypted || !msg.iv) return msg; // old plaintext message — display as-is
      try {
        const plaintext = await decryptMessage(aesKey, msg.iv, msg.text);
        return { ...msg, text: plaintext };
      } catch {
        return { ...msg, text: "[🔒 Decryption failed]" };
      }
    })
  );
}


export const useChatStore = create((set, get) => ({
  messages: [],
  users: [],
  selectedUser: null,
  isUsersLoading: false,
  isMessagesLoading: false,

  getUser: async () => {
    set({ isUsersLoading: true });
    try {
      const res = await axiosInstance.get("/messages/users");
      set({ users: res.data });
    } catch (error) {
      toast.error(error.response?.data?.message || "Failed to fetch friends");
    } finally {
      set({ isUsersLoading: false });
    }
  },

  getMessages: async (userId) => {
    set({ isMessagesLoading: true });
    try {
      const res = await axiosInstance.get(`/messages/${userId}`);
      const myUser = useAuthStore.getState().authUser;

      // Get our ECDH private key from IndexedDB
      const myKeyPair = await getOrCreateKeyPair(myUser._id);

      // Fetch the other user's public key so we can derive the shared AES key
      const keyRes = await axiosInstance.get(`/auth/public-key/${userId}`);
      const theirPublicKeyBase64 = keyRes.data.publicKey;

      // Decrypt all encrypted messages before storing in state
      const decrypted = await decryptMessages(
        res.data,
        myKeyPair.privateKey,
        userId,
        theirPublicKeyBase64
      );

      set({ messages: decrypted });
    } catch (error) {
      toast.error(error.response?.data?.message || "Failed to fetch messages");
    } finally {
      set({ isMessagesLoading: false });
    }
  },

  sendMessage: async (messageData) => {
    const { selectedUser, messages } = get();
    const myUser = useAuthStore.getState().authUser;

    try {
      let payload = { ...messageData };

      // Only encrypt text messages (images are not encrypted in this implementation)
      if (messageData.text) {
        // 1. Load our ECDH private key from IndexedDB
        const myKeyPair = await getOrCreateKeyPair(myUser._id);

        // 2. Fetch the recipient's public key from the server
        const keyRes = await axiosInstance.get(`/auth/public-key/${selectedUser._id}`);
        const theirPublicKeyBase64 = keyRes.data.publicKey;

        if (!theirPublicKeyBase64) {
          // Recipient hasn't set up E2EE yet — send plaintext with a warning
          console.warn("Recipient has no public key — sending unencrypted");
        } else {
          // 3. Derive the shared AES-GCM key (same key both users derive independently)
          const aesKey = await getSharedKey(
            myKeyPair.privateKey,
            selectedUser._id,
            theirPublicKeyBase64
          );

          // 4. Encrypt the message text
          const { iv, ciphertext } = await encryptMessage(aesKey, messageData.text);

          // 5. Replace plaintext with encrypted data in the payload
          payload.text = ciphertext;
          payload.iv = iv;
          payload.isEncrypted = true;
        }
      }

      // 6. Send the (now encrypted) payload to the server
      const res = await axiosInstance.post(`/messages/send/${selectedUser._id}`, payload);

      // 7. Store the decrypted version in local state (so the sender sees plaintext)
      const displayMessage = payload.isEncrypted
        ? { ...res.data, text: messageData.text } // show original text to sender
        : res.data;

      set({ messages: [...messages, displayMessage] });
    } catch (error) {
      toast.error(error.response?.data?.message || "Failed to send message");
    }
  },

  subscribeToMessage: () => {
    const { selectedUser } = get();
    if (!selectedUser) return;

    const socket = useAuthStore.getState().socket;
    const myUser = useAuthStore.getState().authUser;

    socket.on("newMessage", async (newMessage) => {
      const isCurrentChat = newMessage.senderId === selectedUser._id;
      if (!isCurrentChat) return;

      // Decrypt the incoming real-time message if it is encrypted
      let displayMessage = newMessage;
      if (newMessage.isEncrypted && newMessage.iv) {
        try {
          const myKeyPair = await getOrCreateKeyPair(myUser._id);
          const keyRes = await axiosInstance.get(`/auth/public-key/${selectedUser._id}`);
          const aesKey = await getSharedKey(
            myKeyPair.privateKey,
            selectedUser._id,
            keyRes.data.publicKey
          );
          const plaintext = await decryptMessage(aesKey, newMessage.iv, newMessage.text);
          displayMessage = { ...newMessage, text: plaintext };
        } catch {
          displayMessage = { ...newMessage, text: "[🔒 Decryption failed]" };
        }
      }

      set({ messages: [...get().messages, displayMessage] });
    });
  },

  unsubscribeFromMessage: () => {
    const socket = useAuthStore.getState().socket;
    socket.off("newMessage");
  },

  setSelectedUser: (selectedUser) => set({ selectedUser }),
}));
