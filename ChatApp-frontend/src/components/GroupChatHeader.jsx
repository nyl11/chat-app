import { LogOut, Users, Crown, Trash2 } from "lucide-react";
import { useGroupStore } from "../store/useGroupStore";
import { useAuthStore } from "../store/useAuthStore";

const GroupChatHeader = () => {
  const { selectedGroup, leaveGroup, deleteGroup, setSelectedGroup } = useGroupStore();
  const { authUser } = useAuthStore();

  if (!selectedGroup) return null;

  const isAdmin =
    selectedGroup.admin?._id === authUser._id ||
    selectedGroup.admin === authUser._id;

  const memberCount = selectedGroup.members?.length || 0;

  const handleLeave = async () => {
    await leaveGroup(selectedGroup._id);
    setSelectedGroup(null);
  };

  const handleDelete = async () => {
    await deleteGroup(selectedGroup._id);
    setSelectedGroup(null);
  };

  return (
    <div className="p-2.5 border-b border-base-300">
      <div className="flex items-center justify-between">
        {/* Left: Group info */}
        <div className="flex items-center gap-3">
          {/* Avatar */}
          <div className="avatar placeholder">
            <div className="size-10 rounded-xl bg-gradient-to-br from-secondary to-accent">
              {selectedGroup.avatar ? (
                <img
                  src={selectedGroup.avatar}
                  alt={selectedGroup.name}
                  className="object-cover rounded-xl"
                />
              ) : (
                <span className="text-sm font-bold text-primary-content">
                  {selectedGroup.name.charAt(0).toUpperCase()}
                </span>
              )}
            </div>
          </div>

          {/* Name & member count */}
          <div>
            <div className="flex items-center gap-1.5">
              <h3 className="font-semibold">{selectedGroup.name}</h3>
              {isAdmin && (
                <Crown className="size-3.5 text-warning" title="You are the admin" />
              )}
            </div>
            <div className="flex items-center gap-1 text-sm text-base-content/60">
              <Users className="size-3" />
              <span>
                {memberCount} member{memberCount !== 1 ? "s" : ""}
              </span>
            </div>
          </div>
        </div>

        {/* Right: Actions */}
        <div className="flex items-center gap-1">
          {isAdmin ? (
            <button
              onClick={handleDelete}
              className="btn btn-ghost btn-sm text-error hover:bg-error/10 gap-1"
              title="Delete group"
            >
              <Trash2 className="size-4" />
              <span className="hidden sm:inline text-xs">Delete</span>
            </button>
          ) : (
            <button
              onClick={handleLeave}
              className="btn btn-ghost btn-sm text-error hover:bg-error/10 gap-1"
              title="Leave group"
            >
              <LogOut className="size-4" />
              <span className="hidden sm:inline text-xs">Leave</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default GroupChatHeader;
