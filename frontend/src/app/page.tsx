"use client"
import HomePage from "@/components/Homepage";
import { useAuth } from "@/hooks/useAuth";
import { ChatProvider } from "@/context/chatContext";
import { motion } from "framer-motion";

export default function Home() {
    const { isLoading } = useAuth();

    if (isLoading) {
        return (
            <div className="min-h-screen flex flex-col items-center justify-center gap-4">
                <motion.div
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ duration: 0.4 }}
                    className="flex flex-col items-center gap-4"
                >
                    <div className="w-12 h-12 rounded-2xl bg-linear-to-br from-indigo-500 to-purple-500 flex items-center justify-center shadow-lg shadow-indigo-500/30 animate-pulse-glow">
                        <span className="text-white font-bold text-lg">S</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                        <div className="w-2 h-2 rounded-full bg-indigo-500 animate-bounce" style={{ animationDelay: "0ms" }} />
                        <div className="w-2 h-2 rounded-full bg-indigo-400 animate-bounce" style={{ animationDelay: "150ms" }} />
                        <div className="w-2 h-2 rounded-full bg-indigo-300 animate-bounce" style={{ animationDelay: "300ms" }} />
                    </div>
                </motion.div>
            </div>
        )
    }

    return (
        <ChatProvider>
            <HomePage />
        </ChatProvider>
    )
}
