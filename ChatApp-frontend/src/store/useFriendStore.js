import { create } from "zustand";
import toast from "react-hot-toast";
import { axiosInstance } from "../lib/axios";
import { useAuthStore } from "./useAuthStore";

export const useFriendStore = create((set, get) => ({
  friends: [],
  friendRequests: [],       // incoming pending
  sentRequests: [],         // outgoing pending
  searchResults: [],
  isLoading: false,
  isSearching: false,

  // --- Fetch ---
  getFriends: async () => {
    set({ isLoading: true });
    try {
      const res = await axiosInstance.get("/friends");
      set({ friends: res.data });
    } catch (error) {
      toast.error(error.response?.data?.message || "Failed to fetch friends");
    } finally {
      set({ isLoading: false });
    }
  },

  getFriendRequests: async () => {
    try {
      const res = await axiosInstance.get("/friends/requests");
      set({ friendRequests: res.data });
    } catch (error) {
      toast.error(error.response?.data?.message || "Failed to fetch requests");
    }
  },

  getSentRequests: async () => {
    try {
      const res = await axiosInstance.get("/friends/sent");
      set({ sentRequests: res.data });
    } catch (error) {
      toast.error(error.response?.data?.message || "Failed to fetch sent requests");
    }
  },

  searchUsers: async (query) => {
    if (!query.trim()) return set({ searchResults: [] });
    set({ isSearching: true });
    try {
      const res = await axiosInstance.get(`/friends/search?q=${encodeURIComponent(query)}`);
      set({ searchResults: res.data });
    } catch (error) {
      toast.error(error.response?.data?.message || "Search failed");
    } finally {
      set({ isSearching: false });
    }
  },

  // --- Actions ---
  sendRequest: async (userId) => {
    try {
      const res = await axiosInstance.post(`/friends/request/${userId}`);
      toast.success("Friend request sent!");
      // Update search results to reflect "sent" status
      set((state) => ({
        searchResults: state.searchResults.map((u) =>
          u._id === userId
            ? { ...u, friendStatus: "sent", requestId: res.data.request._id }
            : u
        ),
      }));
    } catch (error) {
      toast.error(error.response?.data?.message || "Failed to send request");
    }
  },

  acceptRequest: async (requestId, senderId) => {
    try {
      await axiosInstance.put(`/friends/accept/${requestId}`);
      toast.success("Friend request accepted!");
      // Remove from incoming, add to friends
      const accepted = get().friendRequests.find((r) => r._id === requestId);
      set((state) => ({
        friendRequests: state.friendRequests.filter((r) => r._id !== requestId),
        friends: accepted ? [...state.friends, accepted.senderId] : state.friends,
      }));
    } catch (error) {
      toast.error(error.response?.data?.message || "Failed to accept request");
    }
  },

  rejectRequest: async (requestId) => {
    try {
      await axiosInstance.put(`/friends/reject/${requestId}`);
      toast.success("Request rejected");
      set((state) => ({
        friendRequests: state.friendRequests.filter((r) => r._id !== requestId),
      }));
    } catch (error) {
      toast.error(error.response?.data?.message || "Failed to reject request");
    }
  },

  cancelRequest: async (requestId, receiverId) => {
    try {
      await axiosInstance.delete(`/friends/cancel/${requestId}`);
      toast.success("Request cancelled");
      set((state) => ({
        sentRequests: state.sentRequests.filter((r) => r._id !== requestId),
        searchResults: state.searchResults.map((u) =>
          u._id === receiverId ? { ...u, friendStatus: "none", requestId: null } : u
        ),
      }));
    } catch (error) {
      toast.error(error.response?.data?.message || "Failed to cancel request");
    }
  },

  removeFriend: async (userId) => {
    try {
      await axiosInstance.delete(`/friends/${userId}`);
      toast.success("Friend removed");
      set((state) => ({
        friends: state.friends.filter((f) => f._id !== userId),
      }));
    } catch (error) {
      toast.error(error.response?.data?.message || "Failed to remove friend");
    }
  },

  // --- Real-time socket subscriptions ---
  subscribeToFriendEvents: () => {
    const socket = useAuthStore.getState().socket;
    if (!socket) return;

    socket.on("friendRequest", (request) => {
      set((state) => ({
        friendRequests: [request, ...state.friendRequests],
      }));
      toast(`${request.senderId.fullName} sent you a friend request!`, { icon: "👋" });
    });

    socket.on("friendRequestAccepted", ({ acceptedBy }) => {
      toast.success(`${acceptedBy.fullName} accepted your friend request!`);
      // Refresh friends list
      get().getFriends();
    });

    socket.on("friendRequestRejected", () => {
      // Silently refresh sent requests
      get().getSentRequests();
    });
  },

  unsubscribeFromFriendEvents: () => {
    const socket = useAuthStore.getState().socket;
    if (!socket) return;
    socket.off("friendRequest");
    socket.off("friendRequestAccepted");
    socket.off("friendRequestRejected");
  },
}));
