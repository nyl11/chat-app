import { create } from "zustand";
import toast from "react-hot-toast";
import { axiosInstance } from "../lib/axios";
import { useAuthStore } from "./useAuthStore";

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
      // Group messages are stored as plaintext (TLS-protected in transit).
      // Per-recipient ECDH fan-out encryption for groups is not yet implemented.
      set({ groupMessages: res.data });
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
    try {
      // Group messages are sent as plaintext (protected by TLS).
      // Per-recipient ECDH fan-out encryption for groups is not yet implemented.
      const payload = { ...messageData, isEncrypted: false };

      const res = await axiosInstance.post(
        `/groups/${selectedGroup._id}/messages`,
        payload
      );

      set({ groupMessages: [...groupMessages, res.data] });
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

    socket.on("newGroupMessage", (message) => {
      if (message.groupId !== selectedGroup._id) return;

      // Guard: skip if this message was already added optimistically (sender's own message)
      const alreadyExists = get().groupMessages.some((m) => m._id === message._id);
      if (!alreadyExists) {
        set({ groupMessages: [...get().groupMessages, message] });
      }
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
