import { axiosInstance } from "../lib/axios";

// ─── 1-to-1 (DM) API ────────────────────────────────────────────────────────

/** Fetch the friend list for the sidebar */
export const fetchUsersApi = () =>
  axiosInstance.get("/messages/users").then((r) => r.data);

/** Fetch all messages between the logged-in user and `userId` */
export const fetchMessagesApi = (userId) =>
  axiosInstance.get(`/messages/${userId}`).then((r) => r.data);

/** Send a message to `userId`. payload includes { text, iv, mac, isEncrypted, image } */
export const sendMessageApi = (userId, payload) =>
  axiosInstance.post(`/messages/send/${userId}`, payload).then((r) => r.data);

/** Get the ECDH public key of any user by their ID */
export const fetchPublicKeyApi = (userId) =>
  axiosInstance.get(`/auth/public-key/${userId}`).then((r) => r.data);

/** Publish our own ECDH public key to the server (called once per login) */
export const publishDMPublicKeyApi = (publicKey) =>
  axiosInstance.put("/auth/publish-key", { publicKey });
