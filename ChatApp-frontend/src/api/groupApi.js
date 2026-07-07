import { axiosInstance } from "../lib/axios";

// ─── Group API ─────────────────────────────────────────────────────────────

export const fetchAllGroupsApi = () =>
  axiosInstance.get("/groups").then((r) => r.data);

export const fetchMyGroupsApi = () =>
  axiosInstance.get("/groups/mine").then((r) => r.data);

export const fetchPendingKeysApi = (groupId) =>
  axiosInstance.get(`/groups/${groupId}/pending-keys`).then((r) => r.data);

export const fetchMembersKeysApi = (groupId) =>
  axiosInstance.get(`/groups/${groupId}/members-keys`).then((r) => r.data);

export const distributeKeyApi = (groupId, payload) =>
  axiosInstance.post(`/groups/${groupId}/distribute-key`, payload);

export const publishPublicKeyApi = (publicKey) =>
  axiosInstance.put("/auth/publish-key", { publicKey });

export const fetchGroupMessagesApi = (groupId) =>
  axiosInstance.get(`/groups/${groupId}/messages`).then((r) => r.data);

export const sendGroupMessageApi = (groupId, payload) =>
  axiosInstance.post(`/groups/${groupId}/messages`, payload).then((r) => r.data);

export const createGroupApi = (data) =>
  axiosInstance.post("/groups", data).then((r) => r.data);

export const joinGroupApi = (groupId) =>
  axiosInstance.post(`/groups/${groupId}/join`).then((r) => r.data);

export const leaveGroupApi = (groupId) =>
  axiosInstance.post(`/groups/${groupId}/leave`);

export const deleteGroupApi = (groupId) =>
  axiosInstance.delete(`/groups/${groupId}`);
