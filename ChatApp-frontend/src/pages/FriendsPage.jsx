import { useEffect, useState } from "react";
import { useFriendStore } from "../store/useFriendStore";
import { useAuthStore } from "../store/useAuthStore";
import { Search, UserPlus, UserCheck, UserX, Users, Clock, X } from "lucide-react";

const FriendsPage = () => {
  const [activeTab, setActiveTab] = useState("friends");
  const [searchQuery, setSearchQuery] = useState("");

  const {
    friends,
    friendRequests,
    sentRequests,
    searchResults,
    isLoading,
    isSearching,
    getFriends,
    getFriendRequests,
    getSentRequests,
    searchUsers,
    sendRequest,
    acceptRequest,
    rejectRequest,
    cancelRequest,
    removeFriend,
  } = useFriendStore();

  const { authUser } = useAuthStore();

  useEffect(() => {
    getFriends();
    getFriendRequests();
    getSentRequests();
  }, []);

  useEffect(() => {
    const delay = setTimeout(() => {
      if (activeTab === "find") searchUsers(searchQuery);
    }, 400);
    return () => clearTimeout(delay);
  }, [searchQuery, activeTab]);

  const tabs = [
    { id: "friends", label: "Friends", icon: Users, count: friends.length },
    { id: "requests", label: "Requests", icon: UserPlus, count: friendRequests.length },
    { id: "find", label: "Find People", icon: Search, count: null },
  ];

  return (
    <div className="min-h-screen bg-base-200 pt-16">
      <div className="max-w-3xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent">
            Friends
          </h1>
          <p className="text-base-content/60 mt-1">Manage your connections</p>
        </div>

        {/* Tabs */}
        <div className="tabs tabs-boxed bg-base-100 p-1 rounded-2xl mb-6 shadow-sm">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`tab flex-1 gap-2 rounded-xl transition-all duration-200 ${
                activeTab === tab.id ? "tab-active font-semibold" : "text-base-content/60"
              }`}
            >
              <tab.icon className="size-4" />
              <span className="hidden sm:inline">{tab.label}</span>
              {tab.count !== null && tab.count > 0 && (
                <span
                  className={`badge badge-sm ${
                    tab.id === "requests" ? "badge-error" : "badge-primary"
                  }`}
                >
                  {tab.count}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Tab Content */}
        <div className="space-y-3">
          {/* ---- FRIENDS TAB ---- */}
          {activeTab === "friends" && (
            <>
              {isLoading ? (
                <FriendsSkeleton />
              ) : friends.length === 0 ? (
                <EmptyState
                  icon={<Users className="size-12 text-base-content/30" />}
                  title="No friends yet"
                  subtitle='Go to "Find People" to send your first friend request!'
                />
              ) : (
                friends.map((friend) => (
                  <div
                    key={friend._id}
                    className="flex items-center gap-4 bg-base-100 rounded-2xl p-4 shadow-sm hover:shadow-md transition-shadow"
                  >
                    <div className="avatar">
                      <div className="size-12 rounded-full ring ring-primary ring-offset-base-100 ring-offset-2">
                        <img
                          src={friend.profilePic || "/avatar.png"}
                          alt={friend.fullName}
                        />
                      </div>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold truncate">{friend.fullName}</p>
                      <p className="text-sm text-base-content/50 truncate">{friend.email}</p>
                    </div>
                    <button
                      onClick={() => removeFriend(friend._id)}
                      className="btn btn-ghost btn-sm text-error hover:bg-error/10 gap-1"
                    >
                      <UserX className="size-4" />
                      <span className="hidden sm:inline">Remove</span>
                    </button>
                  </div>
                ))
              )}
            </>
          )}

          {/* ---- REQUESTS TAB ---- */}
          {activeTab === "requests" && (
            <>
              {friendRequests.length === 0 ? (
                <EmptyState
                  icon={<UserPlus className="size-12 text-base-content/30" />}
                  title="No pending requests"
                  subtitle="When someone sends you a friend request, it'll appear here."
                />
              ) : (
                friendRequests.map((req) => (
                  <div
                    key={req._id}
                    className="flex items-center gap-4 bg-base-100 rounded-2xl p-4 shadow-sm"
                  >
                    <div className="avatar">
                      <div className="size-12 rounded-full">
                        <img
                          src={req.senderId.profilePic || "/avatar.png"}
                          alt={req.senderId.fullName}
                        />
                      </div>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold truncate">{req.senderId.fullName}</p>
                      <p className="text-sm text-base-content/50 truncate">{req.senderId.email}</p>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => acceptRequest(req._id, req.senderId._id)}
                        className="btn btn-primary btn-sm gap-1"
                      >
                        <UserCheck className="size-4" />
                        Accept
                      </button>
                      <button
                        onClick={() => rejectRequest(req._id)}
                        className="btn btn-ghost btn-sm text-error hover:bg-error/10"
                      >
                        <X className="size-4" />
                      </button>
                    </div>
                  </div>
                ))
              )}

              {/* Sent requests section */}
              {sentRequests.length > 0 && (
                <>
                  <div className="divider text-base-content/40 text-sm mt-6">
                    Sent Requests
                  </div>
                  {sentRequests.map((req) => (
                    <div
                      key={req._id}
                      className="flex items-center gap-4 bg-base-100 rounded-2xl p-4 shadow-sm opacity-80"
                    >
                      <div className="avatar">
                        <div className="size-12 rounded-full">
                          <img
                            src={req.receiverId.profilePic || "/avatar.png"}
                            alt={req.receiverId.fullName}
                          />
                        </div>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold truncate">{req.receiverId.fullName}</p>
                        <div className="flex items-center gap-1 text-sm text-warning">
                          <Clock className="size-3" />
                          Pending
                        </div>
                      </div>
                      <button
                        onClick={() => cancelRequest(req._id, req.receiverId._id)}
                        className="btn btn-ghost btn-sm text-base-content/50 hover:text-error gap-1"
                      >
                        <X className="size-4" />
                        Cancel
                      </button>
                    </div>
                  ))}
                </>
              )}
            </>
          )}

          {/* ---- FIND PEOPLE TAB ---- */}
          {activeTab === "find" && (
            <>
              <div className="relative mb-4">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 size-4 text-base-content/40" />
                <input
                  type="text"
                  placeholder="Search by name or email..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="input input-bordered w-full pl-11 rounded-2xl focus:outline-none focus:ring-2 focus:ring-primary/30"
                  autoFocus
                />
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery("")}
                    className="absolute right-4 top-1/2 -translate-y-1/2 text-base-content/40 hover:text-base-content"
                  >
                    <X className="size-4" />
                  </button>
                )}
              </div>

              {isSearching && (
                <div className="flex justify-center py-8">
                  <span className="loading loading-dots loading-md text-primary" />
                </div>
              )}

              {!isSearching && searchQuery && searchResults.length === 0 && (
                <EmptyState
                  icon={<Search className="size-12 text-base-content/30" />}
                  title="No users found"
                  subtitle={`No results for "${searchQuery}"`}
                />
              )}

              {!isSearching && !searchQuery && (
                <div className="text-center py-12 text-base-content/40">
                  <Search className="size-10 mx-auto mb-3 opacity-40" />
                  <p>Type a name or email to find people</p>
                </div>
              )}

              {searchResults.map((user) => (
                <div
                  key={user._id}
                  className="flex items-center gap-4 bg-base-100 rounded-2xl p-4 shadow-sm hover:shadow-md transition-shadow"
                >
                  <div className="avatar">
                    <div className="size-12 rounded-full">
                      <img
                        src={user.profilePic || "/avatar.png"}
                        alt={user.fullName}
                      />
                    </div>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold truncate">{user.fullName}</p>
                    <p className="text-sm text-base-content/50 truncate">{user.email}</p>
                  </div>
                  <FriendActionButton
                    status={user.friendStatus}
                    requestId={user.requestId}
                    userId={user._id}
                    onSend={() => sendRequest(user._id)}
                    onCancel={() => cancelRequest(user.requestId, user._id)}
                    onRemove={() => removeFriend(user._id)}
                  />
                </div>
              ))}
            </>
          )}
        </div>
      </div>
    </div>
  );
};

// --- Sub-components ---

const FriendActionButton = ({ status, requestId, userId, onSend, onCancel, onRemove }) => {
  if (status === "friends") {
    return (
      <button onClick={onRemove} className="btn btn-ghost btn-sm text-error hover:bg-error/10 gap-1">
        <UserX className="size-4" /> Remove
      </button>
    );
  }
  if (status === "sent") {
    return (
      <button onClick={onCancel} className="btn btn-ghost btn-sm gap-1 text-warning">
        <Clock className="size-4" /> Pending
      </button>
    );
  }
  if (status === "received") {
    return (
      <span className="badge badge-info gap-1">
        <UserPlus className="size-3" /> Wants to add you
      </span>
    );
  }
  return (
    <button onClick={onSend} className="btn btn-primary btn-sm gap-1">
      <UserPlus className="size-4" /> Add
    </button>
  );
};

const EmptyState = ({ icon, title, subtitle }) => (
  <div className="text-center py-16">
    <div className="flex justify-center mb-4">{icon}</div>
    <p className="font-semibold text-lg text-base-content/70">{title}</p>
    <p className="text-sm text-base-content/40 mt-1 max-w-xs mx-auto">{subtitle}</p>
  </div>
);

const FriendsSkeleton = () => (
  <div className="space-y-3">
    {[...Array(4)].map((_, i) => (
      <div key={i} className="flex items-center gap-4 bg-base-100 rounded-2xl p-4 shadow-sm">
        <div className="skeleton size-12 rounded-full" />
        <div className="flex-1 space-y-2">
          <div className="skeleton h-4 w-32 rounded" />
          <div className="skeleton h-3 w-24 rounded" />
        </div>
      </div>
    ))}
  </div>
);

export default FriendsPage;
