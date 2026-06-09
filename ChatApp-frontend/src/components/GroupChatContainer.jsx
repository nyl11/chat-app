import { useEffect, useRef, useState } from "react";
import { useGroupStore } from "../store/useGroupStore";
import { useAuthStore } from "../store/useAuthStore";
import GroupChatHeader from "./GroupChatHeader";
import MessageSkeleton from "./skeletons/Messageskeleton";
import { Image, X, Send } from "lucide-react";
import toast from "react-hot-toast";
import { formatDistanceToNow } from "date-fns";

const GroupChatContainer = () => {
  const {
    selectedGroup,
    groupMessages,
    isLoadingMessages,
    getGroupMessages,
    sendGroupMessage,
    subscribeToGroupMessages,
    unsubscribeFromGroupMessages,
  } = useGroupStore();
  const { authUser } = useAuthStore();

  const [text, setText] = useState("");
  const [previewImage, setPreviewImage] = useState(null);
  const fileInputRef = useRef(null);
  const messageEndRef = useRef(null);

  useEffect(() => {
    if (selectedGroup?._id) {
      getGroupMessages(selectedGroup._id);
      subscribeToGroupMessages();
    }
    return () => unsubscribeFromGroupMessages();
  }, [selectedGroup?._id]);

  useEffect(() => {
    if (messageEndRef.current && groupMessages.length) {
      messageEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [groupMessages]);

  const handleImageChange = (e) => {
    const file = e.target.files[0];
    if (!file?.type.startsWith("image/")) {
      toast.error("Please select an image file.");
      return;
    }
    const reader = new FileReader();
    reader.onloadend = () => setPreviewImage(reader.result);
    reader.readAsDataURL(file);
  };

  const removeImage = () => {
    setPreviewImage(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleSend = async (e) => {
    e.preventDefault();
    if (!text.trim() && !previewImage) return;
    try {
      await sendGroupMessage({ text: text.trim(), image: previewImage });
      setText("");
      setPreviewImage(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
    } catch {
      toast.error("Failed to send message");
    }
  };

  if (isLoadingMessages) {
    return (
      <div className="flex-1 flex flex-col overflow-auto">
        <GroupChatHeader />
        <MessageSkeleton />
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col overflow-auto">
      <GroupChatHeader />

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-1">
        {groupMessages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-base-content/40 gap-2">
            <p className="text-sm">No messages yet. Be the first to say something!</p>
          </div>
        )}
        {groupMessages.map((message, idx) => {
          const isMe =
            message.senderId?._id === authUser._id ||
            message.senderId === authUser._id;

          const sender = typeof message.senderId === "object" ? message.senderId : null;

          return (
            <div
              key={message._id}
              className={`chat ${isMe ? "chat-end" : "chat-start"}`}
              ref={idx === groupMessages.length - 1 ? messageEndRef : null}
            >
              <div className="chat-image avatar">
                <div className="w-10 rounded-full">
                  <img
                    src={
                      isMe
                        ? authUser.profilePic || "/avatar.png"
                        : sender?.profilePic || "/avatar.png"
                    }
                    alt={isMe ? "You" : sender?.fullName || "Member"}
                  />
                </div>
              </div>

              {/* Show sender name for others */}
              {!isMe && sender && (
                <div className="chat-header mb-1">
                  <span className="text-xs font-semibold text-primary">
                    {sender.fullName}
                  </span>
                </div>
              )}

              <div className="chat-header mb-1">
                <time className="text-xs opacity-50 ml-1">
                  {formatDistanceToNow(new Date(message.createdAt), {
                    addSuffix: true,
                  })}
                </time>
              </div>

              <div className="chat-bubble flex flex-col">
                {message.image && (
                  <img
                    src={message.image}
                    alt="Message"
                    className="sm:max-w-[200px] rounded-md mb-2"
                  />
                )}
                {message.text && <p>{message.text}</p>}
              </div>
            </div>
          );
        })}
      </div>

      {/* Input */}
      <div className="p-4 w-full">
        {previewImage && (
          <div className="mb-3 flex items-center gap-2">
            <div className="relative">
              <img
                src={previewImage}
                alt="Preview"
                className="w-20 h-20 object-cover rounded-lg border border-zinc-700"
              />
              <button
                onClick={removeImage}
                className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-base-300 flex items-center justify-center"
                type="button"
              >
                <X className="size-3" />
              </button>
            </div>
          </div>
        )}

        <form onSubmit={handleSend} className="flex items-center gap-2">
          <div className="flex-1 flex gap-2">
            <input
              type="text"
              className="w-full input input-bordered rounded-lg input-sm sm:input-md"
              placeholder="Type a message..."
              value={text}
              onChange={(e) => setText(e.target.value)}
            />
            <input
              type="file"
              accept="image/*"
              className="hidden"
              ref={fileInputRef}
              onChange={handleImageChange}
            />
            <button
              type="button"
              className={`hidden sm:flex btn btn-circle ${
                previewImage ? "text-emerald-500" : "text-zinc-400"
              }`}
              onClick={() => fileInputRef.current?.click()}
            >
              <Image size={20} />
            </button>
          </div>
          <button
            type="submit"
            className="btn btn-sm btn-circle"
            disabled={!text.trim() && !previewImage}
          >
            <Send size={22} />
          </button>
        </form>
      </div>
    </div>
  );
};

export default GroupChatContainer;
