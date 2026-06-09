import { useEffect, useState } from "react";
import { useGroupStore } from "../store/useGroupStore";
import { useAuthStore } from "../store/useAuthStore";
import { Users, Plus, LogOut, MessageSquare, Globe, Trash2, X, Image, } from "lucide-react";
import { useNavigate } from "react-router-dom";

const GroupsPage = () => {
  const [activeTab, setActiveTab] = useState("my");
  const [showCreateModal, setShowCreateModal] = useState(false);

  const {
    allGroups,
    myGroups,
    isLoadingGroups,
    fetchAllGroups,
    fetchMyGroups,
    joinGroup,
    leaveGroup,
    deleteGroup,
    createGroup,
    setSelectedGroup,
  } = useGroupStore();

  const { authUser } = useAuthStore();
  const navigate = useNavigate();

  useEffect(() => {
    fetchAllGroups();
    fetchMyGroups();
  }, []);

  const myGroupIds = new Set(myGroups.map((g) => g._id));

  const openGroupChat = (group) => {
    setSelectedGroup(group);
    navigate("/");
  };

  return (
    <div className="min-h-screen bg-base-200 pt-16">
      <div className="max-w-3xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold bg-gradient-to-r from-secondary to-accent bg-clip-text text-transparent">
              Groups
            </h1>
            <p className="text-base-content/60 mt-1">Join or create group chats</p>
          </div>
          <button
            onClick={() => setShowCreateModal(true)}
            className="btn btn-primary gap-2"
          >
            <Plus className="size-4" />
            <span className="hidden sm:inline">New Group</span>
          </button>
        </div>

        {/* Tabs */}
        <div className="tabs tabs-boxed bg-base-100 p-1 rounded-2xl mb-6 shadow-sm">
          <button
            onClick={() => setActiveTab("my")}
            className={`tab flex-1 gap-2 rounded-xl transition-all duration-200 ${activeTab === "my" ? "tab-active font-semibold" : "text-base-content/60"
              }`}
          >
            <Users className="size-4" />
            My Groups
            {myGroups.length > 0 && (
              <span className="badge badge-sm badge-primary">{myGroups.length}</span>
            )}
          </button>
          <button
            onClick={() => setActiveTab("discover")}
            className={`tab flex-1 gap-2 rounded-xl transition-all duration-200 ${activeTab === "discover" ? "tab-active font-semibold" : "text-base-content/60"
              }`}
          >
            <Globe className="size-4" />
            Discover
          </button>
        </div>

        {/* Content */}
        {isLoadingGroups ? (
          <GroupsSkeleton />
        ) : (
          <div className="space-y-3">
            {/* MY GROUPS */}
            {activeTab === "my" && (
              <>
                {myGroups.length === 0 ? (
                  <EmptyState
                    icon={<Users className="size-12 text-base-content/30" />}
                    title="You haven't joined any groups yet"
                    subtitle='Create a new group or browse "Discover" to join one!'
                    action={
                      <button
                        onClick={() => setShowCreateModal(true)}
                        className="btn btn-primary btn-sm gap-2 mt-4"
                      >
                        <Plus className="size-4" /> Create Group
                      </button>
                    }
                  />
                ) : (
                  myGroups.map((group) => (
                    <GroupCard
                      key={group._id}
                      group={group}
                      authUserId={authUser._id}
                      isMember={true}
                      onOpen={() => openGroupChat(group)}
                      onLeave={() => leaveGroup(group._id)}
                      onDelete={() => deleteGroup(group._id)}
                    />
                  ))
                )}
              </>
            )}

            {/* DISCOVER */}
            {activeTab === "discover" && (
              <>
                {allGroups.length === 0 ? (
                  <EmptyState
                    icon={<Globe className="size-12 text-base-content/30" />}
                    title="No groups available"
                    subtitle="Be the first to create a group!"
                  />
                ) : (
                  allGroups.map((group) => (
                    <GroupCard
                      key={group._id}
                      group={group}
                      authUserId={authUser._id}
                      isMember={myGroupIds.has(group._id)}
                      onOpen={() => openGroupChat(group)}
                      onJoin={() => joinGroup(group._id)}
                      onLeave={() => leaveGroup(group._id)}
                      onDelete={() => deleteGroup(group._id)}
                    />
                  ))
                )}
              </>
            )}
          </div>
        )}
      </div>

      {/* Create Group Modal */}
      {showCreateModal && (
        <CreateGroupModal
          onClose={() => setShowCreateModal(false)}
          onCreate={createGroup}
        />
      )}
    </div>
  );
};

// --- GroupCard ---
const GroupCard = ({
  group,
  authUserId,
  isMember,
  onOpen,
  onJoin,
  onLeave,
  onDelete,
}) => {
  const isAdmin = group.admin?._id === authUserId || group.admin === authUserId;

  return (
    <div className="flex items-center gap-4 bg-base-100 rounded-2xl p-4 shadow-sm hover:shadow-md transition-all duration-200">
      {/* Avatar */}
      <div className="avatar placeholder">
        <div
          className={`size-14 rounded-2xl ${group.avatar ? "" : "bg-gradient-to-br from-primary to-secondary"
            }`}
        >
          {group.avatar ? (
            <img src={group.avatar} alt={group.name} className="object-cover rounded-2xl" />
          ) : (
            <span className="text-xl font-bold text-primary-content">
              {group.name.charAt(0).toUpperCase()}
            </span>
          )}
        </div>
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className="font-semibold truncate">{group.name}</p>
          {isAdmin && (
            <span className="badge badge-xs badge-accent">Admin</span>
          )}
        </div>
        {group.description && (
          <p className="text-sm text-base-content/50 truncate">{group.description}</p>
        )}
        <p className="text-xs text-base-content/40 mt-0.5">
          {group.members?.length || 0} member{group.members?.length !== 1 ? "s" : ""}
        </p>
      </div>

      {/* Actions */}
      <div className="flex gap-2">
        {isMember && (
          <button onClick={onOpen} className="btn btn-primary btn-sm gap-1">
            <MessageSquare className="size-4" />
            <span className="hidden sm:inline">Chat</span>
          </button>
        )}
        {!isMember && (
          <button onClick={onJoin} className="btn btn-outline btn-sm gap-1">
            <Plus className="size-4" />
            <span className="hidden sm:inline">Join</span>
          </button>
        )}
        {isMember && !isAdmin && (
          <button
            onClick={onLeave}
            className="btn btn-ghost btn-sm text-error hover:bg-error/10"
            title="Leave group"
          >
            <LogOut className="size-4" />
          </button>
        )}
        {isAdmin && (
          <button
            onClick={onDelete}
            className="btn btn-ghost btn-sm text-error hover:bg-error/10"
            title="Delete group"
          >
            <Trash2 className="size-4" />
          </button>
        )}
      </div>
    </div>
  );
};

// --- Create Group Modal ---
const CreateGroupModal = ({ onClose, onCreate }) => {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [avatarPreview, setAvatarPreview] = useState(null);
  const [avatarBase64, setAvatarBase64] = useState(null);
  const [isCreating, setIsCreating] = useState(false);

  const handleImageChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onloadend = () => {
      setAvatarBase64(reader.result);
      setAvatarPreview(reader.result);
    };
    reader.readAsDataURL(file);
  };

  const handleCreate = async () => {
    if (!name.trim()) return;
    setIsCreating(true);
    const result = await onCreate({
      name: name.trim(),
      description: description.trim(),
      avatar: avatarBase64 || null,
    });
    setIsCreating(false);
    if (result) onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-base-100 rounded-3xl p-6 w-full max-w-md mx-4 shadow-2xl animate-in fade-in slide-in-from-bottom-4 duration-200">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold">Create Group</h2>
          <button onClick={onClose} className="btn btn-ghost btn-sm btn-circle">
            <X className="size-4" />
          </button>
        </div>

        {/* Avatar upload */}
        <div className="flex justify-center mb-6">
          <label className="cursor-pointer group relative">
            <div className="size-20 rounded-2xl bg-base-200 flex items-center justify-center overflow-hidden ring-2 ring-primary/20 group-hover:ring-primary transition-all">
              {avatarPreview ? (
                <img src={avatarPreview} alt="avatar" className="object-cover size-full" />
              ) : (
                <Image className="size-8 text-base-content/30 group-hover:text-primary transition-colors" />
              )}
            </div>
            <input
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleImageChange}
            />
            <div className="absolute -bottom-1 -right-1 bg-primary rounded-full p-1">
              <Plus className="size-3 text-primary-content" />
            </div>
          </label>
        </div>

        {/* Fields */}
        <div className="space-y-4">
          <div>
            <label className="label pb-1">
              <span className="label-text font-medium">Group Name *</span>
            </label>
            <input
              type="text"
              placeholder="e.g. Study Buddies"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="input input-bordered w-full rounded-xl"
              maxLength={50}
            />
          </div>

          <div>
            <label className="label pb-1">
              <span className="label-text font-medium">Description</span>
            </label>
            <textarea
              placeholder="What's this group about?"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="textarea textarea-bordered w-full rounded-xl resize-none"
              rows={3}
              maxLength={200}
            />
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-3 mt-6">
          <button onClick={onClose} className="btn btn-ghost flex-1 rounded-xl">
            Cancel
          </button>
          <button
            onClick={handleCreate}
            disabled={!name.trim() || isCreating}
            className="btn btn-primary flex-1 rounded-xl"
          >
            {isCreating ? (
              <span className="loading loading-spinner loading-sm" />
            ) : (
              "Create"
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

// --- Helpers ---
const EmptyState = ({ icon, title, subtitle, action }) => (
  <div className="text-center py-16">
    <div className="flex justify-center mb-4">{icon}</div>
    <p className="font-semibold text-lg text-base-content/70">{title}</p>
    <p className="text-sm text-base-content/40 mt-1 max-w-xs mx-auto">{subtitle}</p>
    {action}
  </div>
);

const GroupsSkeleton = () => (
  <div className="space-y-3">
    {[...Array(4)].map((_, i) => (
      <div key={i} className="flex items-center gap-4 bg-base-100 rounded-2xl p-4 shadow-sm">
        <div className="skeleton size-14 rounded-2xl" />
        <div className="flex-1 space-y-2">
          <div className="skeleton h-4 w-40 rounded" />
          <div className="skeleton h-3 w-28 rounded" />
        </div>
      </div>
    ))}
  </div>
);

export default GroupsPage;
