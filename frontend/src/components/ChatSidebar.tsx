"use client"
import { Input } from "./ui/input"
import { UserSheet } from "./UserSheet"
import { SearchIcon } from "lucide-react"
import Image from "next/image"
import { useChat, Chat } from "@/context/chatContext"
import { GroupDialog } from "./GroupDialog"
import { Navbar } from "./Navbar"
import { User, Users } from "lucide-react"
import { useResetUnseen } from "@/hooks/chatHooks"
import { ChatSidebarSkeleton } from "./ChatLoader"
import { motion } from "framer-motion"

export const ChatSidebar = () => {
    const { isLoading, chats, refetch } = useChat();

    if (isLoading) {
        return <ChatSidebarSkeleton />
    }

    return (
        <div className="flex flex-col w-full h-full rounded-2xl glass-strong overflow-hidden">
            {/* Header */}
            <div className="px-4 pt-5 pb-4">
                <h2 className="text-lg font-semibold text-[var(--text-primary)] mb-4 px-1">Messages</h2>
                <div className="flex items-center gap-2">
                    <div className="relative flex-1">
                        <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)] h-4 w-4" />
                        <Input
                            placeholder="Search conversations..."
                            className="w-full pl-9 pr-4 py-2.5 h-10 rounded-xl bg-[var(--bg-tertiary)] border-[var(--border-subtle)] text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus-glow transition-all duration-200"
                        />
                    </div>
                    <UserSheet onAddChat={refetch} />
                    <GroupDialog onAddChat={refetch} />
                </div>
            </div>

            {/* Chat list */}
            <div className="flex-1 overflow-y-auto px-2 pb-2">
                {chats && chats.map((chat: Chat, index: number) => (
                    <motion.div
                        key={chat.id || index}
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.3, delay: index * 0.04 }}
                    >
                        <ChatCard chat={chat} />
                    </motion.div>
                ))}
            </div>

            <Navbar />
        </div>
    )
}


const ChatCard = ({ chat }: any) => {
    const { selectChat, selectedChat } = useChat();
    const { isGroupChat, latestMessage, latestMessageCreatedAt, unseenCount, name, otherImageUrl } = chat;
    const { resetUnseen } = useResetUnseen();
    const isActive = selectedChat?.id === chat.id;

    const formatDate = (latestMessageCreatedAt: string) => {
        const date = new Date(latestMessageCreatedAt);
        return date.toLocaleDateString("en-US", { day: "2-digit", month: "short" });
    };

    const handleChatSelect = () => {
        selectChat(chat);
        const userId = localStorage.getItem("userId");
        if (!userId) return;
        resetUnseen({ userId, chatId: chat.id })
        chat.unseenCount = 0;
    }

    const latestTime = formatDate(latestMessageCreatedAt)

    return (
        <div
            className={`flex justify-between items-center p-3 mx-1 my-0.5 rounded-xl cursor-pointer transition-all duration-200 group
                ${isActive
                    ? "bg-indigo-500/10 border border-indigo-500/20"
                    : "hover:bg-[var(--glass-hover)] border border-transparent"
                }`}
            onClick={handleChatSelect}
        >
            <div className="flex gap-3 items-center flex-1 min-w-0">
                <div className="relative flex-shrink-0">
                    {otherImageUrl && otherImageUrl.length > 0 ? (
                        <div className="w-11 h-11 relative rounded-full ring-2 ring-[var(--border-subtle)] group-hover:ring-[var(--border-default)] transition-all">
                            <Image
                                src={otherImageUrl}
                                alt="profile"
                                fill
                                className="rounded-full object-cover"
                            />
                        </div>
                    ) : (
                        <div className="w-11 h-11 rounded-full bg-[var(--bg-tertiary)] flex items-center justify-center ring-2 ring-[var(--border-subtle)]">
                            {isGroupChat ? (
                                <Users className="w-5 h-5 text-[var(--text-muted)]" />
                            ) : (
                                <User className="w-5 h-5 text-[var(--text-muted)]" />
                            )}
                        </div>
                    )}
                    {/* Online indicator */}
                    <div className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 bg-emerald-500 rounded-full border-2 border-[var(--bg-secondary)]" />
                </div>

                <div className="flex flex-col justify-center min-w-0 flex-1">
                    <h3 className={`font-medium text-sm truncate ${isActive ? "text-indigo-300" : "text-[var(--text-primary)]"}`}>
                        {name}
                    </h3>
                    <p className="text-[var(--text-muted)] text-xs truncate mt-0.5">
                        {latestMessage || "No messages yet"}
                    </p>
                </div>
            </div>

            <div className="flex flex-col items-end gap-1.5 ml-2 flex-shrink-0">
                <p className="text-[10px] text-[var(--text-muted)]">{latestTime}</p>
                {unseenCount > 0 && (
                    <span className="bg-indigo-500 text-white rounded-full min-w-[20px] h-5 px-1.5 flex items-center justify-center text-[10px] font-semibold shadow-lg shadow-indigo-500/30 animate-pulse-glow">
                        {unseenCount}
                    </span>
                )}
            </div>
        </div>
    )
}
