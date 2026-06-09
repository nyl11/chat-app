import { Link } from "react-router-dom";
import { useAuthStore } from "../store/useAuthStore";
import { useFriendStore } from "../store/useFriendStore";
import { LogOut, MessageSquare, Settings, User, Users, Globe } from "lucide-react";

const Navbar = () => {
  const { logout, authUser } = useAuthStore();
  const { friendRequests } = useFriendStore();

  const pendingCount = friendRequests.length;

  return (
    <header
      className="bg-base-100 border-b border-base-300 fixed w-full top-0 z-40 
    backdrop-blur-lg bg-base-100/80"
    >
      <div className="container mx-auto px-4 h-16">
        <div className="flex items-center justify-between h-full">
          {/* Left: Logo */}
          <div className="flex items-center gap-8">
            <Link to="/" className="flex items-center gap-2.5 hover:opacity-80 transition-all">
              <div className="size-9 rounded-lg bg-primary/10 flex items-center justify-center">
                <MessageSquare className="w-5 h-5 text-primary" />
              </div>
              <h1 className="text-lg font-bold">Kura Kani</h1>
            </Link>
          </div>

          {/* Right: Nav links */}
          <div className="flex items-center gap-2">
            {authUser && (
              <>
                {/* Friends link with badge */}
                <Link
                  to="/friends"
                  className="btn btn-sm gap-2 relative"
                  title="Friends"
                >
                  <Users className="w-4 h-4" />
                  <span className="hidden sm:inline">Friends</span>
                  {pendingCount > 0 && (
                    <span className="absolute -top-1 -right-1 size-4 bg-error text-error-content rounded-full text-[10px] flex items-center justify-center font-bold">
                      {pendingCount > 9 ? "9+" : pendingCount}
                    </span>
                  )}
                </Link>

                {/* Groups link */}
                <Link
                  to="/groups"
                  className="btn btn-sm gap-2"
                  title="Groups"
                >
                  <Globe className="w-4 h-4" />
                  <span className="hidden sm:inline">Groups</span>
                </Link>
              </>
            )}

            <Link
              to="/settings"
              className="btn btn-sm gap-2 transition-colors"
            >
              <Settings className="w-4 h-4" />
              <span className="hidden sm:inline">Settings</span>
            </Link>

            {authUser && (
              <>
                <Link to="/profile" className="btn btn-sm gap-2">
                  <User className="size-5" />
                  <span className="hidden sm:inline">Profile</span>
                </Link>

                <button className="flex gap-2 items-center" onClick={logout}>
                  <LogOut className="size-5" />
                  <span className="hidden sm:inline">Logout</span>
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </header>
  );
};

export default Navbar;