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

// 🔒 Set to false to disable E2EE and send/receive messages as plaintext
const E2EE_ENABLED = true;


// Helper: decrypt a list of messages using the shared AES key
// with the other user. Skips any message that is not encrypted
// (backwards compatible with old plaintext messages).


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

      let finalMessages = res.data;

      if (E2EE_ENABLED) {
        const myUser = useAuthStore.getState().authUser;
        const myKeyPair = await getOrCreateKeyPair(myUser._id);
        const keyRes = await axiosInstance.get(`/auth/public-key/${userId}`);
        finalMessages = await decryptMessages(
          res.data,
          myKeyPair.privateKey,
          userId,
          keyRes.data.publicKey
        );
      }

      set({ messages: finalMessages });
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

      // Encrypt text only when E2EE is enabled
      if (E2EE_ENABLED && messageData.text) {
        const myKeyPair = await getOrCreateKeyPair(myUser._id);
        const keyRes = await axiosInstance.get(`/auth/public-key/${selectedUser._id}`);
        const theirPublicKeyBase64 = keyRes.data.publicKey;

        if (!theirPublicKeyBase64) {
          console.warn("Recipient has no public key — sending unencrypted");
        } else {
          const aesKey = await getSharedKey(
            myKeyPair.privateKey,
            selectedUser._id,
            theirPublicKeyBase64
          );
          const { iv, ciphertext } = await encryptMessage(aesKey, messageData.text);
          payload.text = ciphertext;
          payload.iv = iv;
          payload.isEncrypted = true;
        }
      }

      const res = await axiosInstance.post(`/messages/send/${selectedUser._id}`, payload);

      const displayMessage = payload.isEncrypted
        ? { ...res.data, text: messageData.text }
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
      // Only try to decrypt if E2EE is enabled and the message has encrypted fields
      if (E2EE_ENABLED && newMessage.isEncrypted && newMessage.iv) {
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

      // Guard: skip if this message was already added optimistically (sender's own message)
      const alreadyExists = get().messages.some((m) => m._id === displayMessage._id);
      if (!alreadyExists) {
        set({ messages: [...get().messages, displayMessage] });
      }
    });
  },

  unsubscribeFromMessage: () => {
    const socket = useAuthStore.getState().socket;
    socket.off("newMessage");
  },

  setSelectedUser: (selectedUser) => set({ selectedUser }),
}));
