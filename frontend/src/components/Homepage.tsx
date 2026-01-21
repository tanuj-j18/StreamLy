
import { ChatSidebar } from "./ChatSidebar";
import { ChatBox } from "./ChatBox";
import { useChat } from "@/context/chatContext";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowLeft } from "lucide-react";

export default function HomePage() {
    const { selectedChat, setSelectedChat } = useChat();
    return (
        <>
            {/* Desktop Container */}
            <div className="hidden lg:block">
                <div className="h-screen flex gap-4 p-4 overflow-y-hidden">
                    <motion.div
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ duration: 0.4, ease: "easeOut" }}
                        className="w-[340px] min-w-[340px]"
                    >
                        <ChatSidebar />
                    </motion.div>

                    <motion.div
                        initial={{ opacity: 0, x: 20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ duration: 0.4, ease: "easeOut", delay: 0.1 }}
                        className="flex-1"
                    >
                        <ChatBox />
                    </motion.div>
                </div>
            </div>

            {/* Mobile Container */}
            <div className="block lg:hidden">
                <AnimatePresence mode="wait">
                    {selectedChat ? (
                        <motion.div
                            key="chatbox"
                            initial={{ opacity: 0, x: 50 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: 50 }}
                            transition={{ duration: 0.25, ease: "easeOut" }}
                            className="w-screen h-screen p-3"
                        >
                            <button
                                onClick={() => setSelectedChat(null)}
                                className="flex items-center gap-2 px-3 py-2 mb-2 rounded-lg glass glass-hover text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-all duration-200"
                            >
                                <ArrowLeft className="w-4 h-4" />
                                <span className="text-sm">Back</span>
                            </button>
                            <ChatBox />
                        </motion.div>
                    ) : (
                        <motion.div
                            key="sidebar"
                            initial={{ opacity: 0, x: -50 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: -50 }}
                            transition={{ duration: 0.25, ease: "easeOut" }}
                            className="w-screen h-screen p-3"
                        >
                            <ChatSidebar />
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>
        </>
    )
}