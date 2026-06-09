import { create } from "zustand";
import { axiosInstance } from "../lib/axios";
import { toast } from "react-hot-toast";
import { io } from "socket.io-client";
import { getOrCreateKeyPair, exportPublicKey, clearSharedKeyCache } from "../lib/crypto";

const SOCKET_URL = import.meta.env.MODE === "development" ? "http://localhost:5001" : "/";

// Called after every login/signup to generate or load the user's ECDH key pair
// and publish the public key to the server so others can encrypt messages to them.
async function setupE2EE(userId) {
  try {
    const keyPair = await getOrCreateKeyPair(userId);
    const publicKeyBase64 = await exportPublicKey(keyPair.publicKey);
    await axiosInstance.put("/auth/publish-key", { publicKey: publicKeyBase64 });
    console.log("✅ E2EE keys ready");
  } catch (err) {
    console.error("E2EE setup failed:", err);
  }
}

export const useAuthStore = create((set, get) => ({
  authUser: null,
  isSigningUp: false,
  isLoggingIn: false,
  isUpdatingProfile: false,
  isCheckingAuth: true,
  onlineUsers: [],
  socket: null,

  checkAuth: async () => {
    try {
      const res = await axiosInstance.get("/auth/check");
      set({ authUser: res.data });
      get().connectSocket();
      await setupE2EE(res.data._id); // generate/load keys and publish public key
    } catch (error) {
      console.log("error in checkAuth:", error);
      set({ authUser: null });
    } finally {
      set({ isCheckingAuth: false });
    }
  },

  signup: async (data) => {
    set({ isSigningUp: true });
    try {
      const res = await axiosInstance.post("/auth/signup", data);
      set({ authUser: res.data });
      toast.success("Account Created Successfully!");
      get().connectSocket();
      await setupE2EE(res.data._id); // generate/load keys and publish public key

    } catch (error) {
      toast.error(error.response?.data?.message || "Signup failed");
    } finally {
      set({ isSigningUp: false });
    }
  },

  googleSignup: async (credential) => {
    set({ isSigningUp: true });
    try {
      const res = await axiosInstance.post("/auth/google-signup", {
        token: credential,
      });
      set({ authUser: res.data });
      toast.success("Authentication successful!");
      get().connectSocket();
      await setupE2EE(res.data._id); // generate/load keys and publish public key

    } catch (error) {
      toast.error(
        error.response?.data?.message || "Google authentication failed",
      );
    } finally {
      set({ isSigningUp: false });
    }
  },

  login: async (data) => {
    set({ isLoggingIn: true });
    try {
      const res = await axiosInstance.post("/auth/login", data);
      set({ authUser: res.data });
      toast.success("Logged in successfully!");
      get().connectSocket();
      await setupE2EE(res.data._id); // generate/load keys and publish public key

    } catch (error) {
      toast.error(error.response?.data?.message || "Login failed");
    } finally {
      set({ isLoggingIn: false });
    }
  },

  logout: async () => {
    try {
      await axiosInstance.post("/auth/logout");
      set({ authUser: null });
      toast.success("Logged out successfully");
      clearSharedKeyCache(); // clear in-memory AES key cache on logout
      get().disconnectSocket();

    } catch (error) {
      toast.error(error.response?.data?.message || "Logout failed");
    }
  },

  updateProfile: async (data) => {
    set({ isUpdatingProfile: true });
    try {
      const res = await axiosInstance.put("/auth/update-profile", data);
      set({ authUser: res.data }); //set the updated user data
      toast.success("Profile updated successfully!");
    } catch (error) {
      console.log("error in updateProfile:", error);
      toast.error(error.response?.data?.message || "Profile update failed");
    } finally {
      set({ isUpdatingProfile: false });
    }
  },

  connectSocket: () => {
    const { authUser } = get();
    if (!authUser || get().socket?.connected) return; // Don't connect if user is not authenticated

    const socket = io(SOCKET_URL, {
      query: {
        userId: authUser._id
      }
    });

    socket.connect();
    set({ socket: socket })

    socket.on("getOnlineUsers", (userIds) => {
      set({ onlineUsers: userIds })
    })
  },

  disconnectSocket: () => {
    if (get().socket?.connected) get().socket.disconnect();
  },
}));
