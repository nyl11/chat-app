import React from 'react'
import { useEffect, useState } from 'react'
import { useChatStore } from '../store/useChatStore'
import { useGroupStore } from '../store/useGroupStore'
import SidebarSkeleton from './skeletons/SidebarSkeleton';
import { Users, MessageSquare } from 'lucide-react';
import { useAuthStore } from '../store/useAuthStore';

const Sidebar = () => {
  const { users, selectedUser, setSelectedUser, getUser, isUsersLoading } = useChatStore();
  const { myGroups, selectedGroup, setSelectedGroup, fetchMyGroups } = useGroupStore();
  const { onlineUsers } = useAuthStore();

  const [activeTab, setActiveTab] = useState("chats");
  const [onlineStatus, setOnlineStatus] = useState(false);

  useEffect(() => {
    getUser();
    fetchMyGroups();
  }, [getUser]);

  const filteredUsers = onlineStatus
    ? users.filter((user) => onlineUsers.includes(user._id))
    : users;

  const handleSelectUser = (user) => {
    setSelectedUser(user);
    setSelectedGroup(null);
  };

  const handleSelectGroup = (group) => {
    setSelectedGroup(group);
    setSelectedUser(null);
  };

  if (isUsersLoading && activeTab === "chats") return <SidebarSkeleton />;

  return (
    <aside className='h-full w-20 lg:w-72 border-r border-base-300 flex flex-col transition-all duration-200'>
      {/* Tab header */}
      <div className='border-b border-base-300 w-full p-3'>
        <div className="flex gap-1">
          <button
            onClick={() => setActiveTab("chats")}
            className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-xl text-sm font-medium transition-all
              ${activeTab === "chats"
                ? "bg-primary text-primary-content"
                : "hover:bg-base-200 text-base-content/60"
              }`}
          >
            <MessageSquare className="size-4" />
            <span className="hidden lg:inline">Chats</span>
          </button>
          <button
            onClick={() => setActiveTab("groups")}
            className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-xl text-sm font-medium transition-all
              ${activeTab === "groups"
                ? "bg-primary text-primary-content"
                : "hover:bg-base-200 text-base-content/60"
              }`}
          >
            <Users className="size-4" />
            <span className="hidden lg:inline">Groups</span>
            {myGroups.length > 0 && (
              <span className={`badge badge-xs ${activeTab === "groups" ? "badge-primary-content" : "badge-primary"}`}>
                {myGroups.length}
              </span>
            )}
          </button>
        </div>

        {/* Online filter (chats tab only) */}
        {activeTab === "chats" && (
          <div className="mt-2 hidden lg:flex items-center gap-2">
            <label className="cursor-pointer flex items-center gap-2">
              <input
                type="checkbox"
                checked={onlineStatus}
                onChange={(e) => setOnlineStatus(e.target.checked)}
                className="checkbox checkbox-sm"
              />
              <span className="text-sm">Online only</span>
            </label>
            <span className="text-xs text-zinc-500">({Math.max(0, onlineUsers.length - 1)} online)</span>
          </div>
        )}
      </div>

      {/* List */}
      <div className="overflow-y-auto w-full py-3 flex-1">
        {/* CHATS */}
        {activeTab === "chats" && (
          <>
            {filteredUsers.length === 0 ? (
              <div className="text-center text-zinc-500 py-8 px-3 text-sm">
                {onlineStatus ? "No online friends" : "No friends yet. Add some!"}
              </div>
            ) : (
              filteredUsers.map((user) => (
                <button
                  key={user._id}
                  onClick={() => handleSelectUser(user)}
                  className={`
                    w-full p-3 flex items-center gap-3
                    hover:bg-base-300 transition-colors
                    ${selectedUser?._id === user._id ? "bg-base-300 ring-1 ring-base-300" : ""}
                  `}
                >
                  <div className="relative mx-auto lg:mx-0">
                    <img
                      src={user.profilePic || "/avatar.png"}
                      alt={user.fullName}
                      className="size-12 object-cover rounded-full"
                    />
                    {onlineUsers.includes(user._id) && (
                      <span className="absolute bottom-0 right-0 size-3 bg-green-500 rounded-full ring-2 ring-zinc-900" />
                    )}
                  </div>
                  <div className="hidden lg:block text-left min-w-0">
                    <div className="font-medium truncate">{user.fullName}</div>
                    <div className="text-sm text-zinc-400">
                      {onlineUsers.includes(user._id) ? "Online" : "Offline"}
                    </div>
                  </div>
                </button>
              ))
            )}
          </>
        )}

        {/* GROUPS */}
        {activeTab === "groups" && (
          <>
            {myGroups.length === 0 ? (
              <div className="text-center text-zinc-500 py-8 px-3 text-sm">
                No groups yet. Join or create one!
              </div>
            ) : (
              myGroups.map((group) => (
                <button
                  key={group._id}
                  onClick={() => handleSelectGroup(group)}
                  className={`
                    w-full p-3 flex items-center gap-3
                    hover:bg-base-300 transition-colors
                    ${selectedGroup?._id === group._id ? "bg-base-300 ring-1 ring-base-300" : ""}
                  `}
                >
                  <div className="mx-auto lg:mx-0">
                    <div className="size-12 rounded-xl bg-gradient-to-br from-secondary to-accent flex items-center justify-center overflow-hidden">
                      {group.avatar ? (
                        <img src={group.avatar} alt={group.name} className="object-cover size-full" />
                      ) : (
                        <span className="text-lg font-bold text-primary-content">
                          {group.name.charAt(0).toUpperCase()}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="hidden lg:block text-left min-w-0">
                    <div className="font-medium truncate">{group.name}</div>
                    <div className="text-sm text-zinc-400 truncate">
                      {group.members?.length || 0} members
                    </div>
                  </div>
                </button>
              ))
            )}
          </>
        )}
      </div>
    </aside>
  );
};

export default Sidebar;