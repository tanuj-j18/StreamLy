"use client"
import { useEffect, useState, useRef } from "react"
import Image from "next/image"
import { Video, Phone, Smile, PlusIcon, Send, X, User, Users } from "lucide-react"
import { Input } from "./ui/input"
import { Message } from "./Message"
import { useChat } from "@/context/chatContext"
import axios from "axios"
import { toast } from "sonner";
import { ChatMessages } from "@/context/chatContext"
import { v4 as uuidv4 } from 'uuid';
import { motion, AnimatePresence } from "framer-motion"

export const ChatBox = () => {
    const { selectedChat, socket } = useChat();
    const [messageContent, setMessageContent] = useState("");
    const fileInputRef = useRef<HTMLInputElement | null>(null);
    const messageEndRef = useRef<HTMLDivElement | null>(null);
    const [file, setFile] = useState<File | null>(null);
    const [imageUrl, setImageUrl] = useState("");
    const [inputDisabled, setInputDisabled] = useState<boolean>(false);

    useEffect(() => {
        messageEndRef.current?.scrollIntoView({ behavior: "auto" });
    }, [selectedChat?.chatMessages]);

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const fileToSend = e.target.files?.[0];
        if (!fileToSend) return;
        setFile(fileToSend);
        const imgUrl = URL.createObjectURL(fileToSend);
        setImageUrl(imgUrl);
        setInputDisabled(true);
    }

    const handleClick = () => {
        if (!fileInputRef.current) return;
        fileInputRef.current.click();
        let fileSelected = false;
        const onFileChange = () => {
            fileSelected = true;
            setInputDisabled(true);
            fileInputRef.current?.removeEventListener('change', onFileChange);
        };
        const onFocus = () => {
            setTimeout(() => { if (!fileSelected) setInputDisabled(false); }, 100);
            window.removeEventListener("focus", onFocus);
        };
        fileInputRef.current.addEventListener('change', onFileChange);
        window.addEventListener("focus", onFocus);
    };

    const clearMessageInput = () => {
        setMessageContent("");
        setFile(null);
        setImageUrl("");
        setInputDisabled(false);
        if (fileInputRef.current) fileInputRef.current.value = "";
    }

    const handleMessageSubmit = async () => {
        if (!file && !messageContent.trim()) {
            toast.error("Message cannot be empty");
            return;
        }
        const authorId = localStorage.getItem("userId");
        const email = localStorage.getItem("email");
        const name = localStorage.getItem("name");
        const userImageUrl = localStorage.getItem("imageUrl");
        if (!authorId || !email || !name) return;
        const author = { email, name, imageUrl: userImageUrl || "" }

        try {
            if (file) {
                handleFileSubmit(file, author, authorId);
                return;
            }
            const message = {
                author, type: "TEXT", content: messageContent.trim(),
                authorId, mediaUrl: "", chatId: selectedChat?.id, createdAt: Date.now()
            }
            socket.emit("send-message", message);
            clearMessageInput();
        } catch (error) {
            toast.error("Failed to send message");
            console.error("Message send error:", error);
        }
    }

    const handleFileSubmit = async (file: File, author: any, authorId: string) => {
        try {
            const response = await axios.get(`${process.env.NEXT_PUBLIC_BACKEND_URL}/api/v1/upload/get-presigned-url`, {
                params: { fileType: file.type },
            })
            const { key, url } = response.data
            await axios.put(url, file, { headers: { "Content-Type": file.type } })
            const mediaUrl = `https://${process.env.NEXT_PUBLIC_BUCKET_NAME}.s3.amazonaws.com/${key}`
            const message = {
                author, type: "MEDIA", content: "", authorId,
                mediaUrl, chatId: selectedChat?.id, createdAt: Date.now()
            }
            socket.emit("send-message", message);
            clearMessageInput();
        } catch (error) {console.log("Something went wrong while uploading the image to s3 ", error)
        }
    }

    const handleVideoCall = () => {
        const videoCallUrl = uuidv4();
        const authorId = localStorage.getItem("userId");
        const email = localStorage.getItem("email");
        const name = localStorage.getItem("name");
        const userImageUrl = localStorage.getItem("imageUrl");
        if (!authorId || !email || !name) return;
        const author = { email, name, imageUrl: userImageUrl || "" }
        const message = {
            author, type: "CALL", content: "VIDEO", authorId,
            mediaUrl: "", callUrl: videoCallUrl, chatId: selectedChat?.id, createdAt: Date.now()
        }
        socket.emit("send-message", message)
    }

    const handleVoiceCall = () => {
        const voiceCallUrl = uuidv4();
        const authorId = localStorage.getItem("userId");
        const email = localStorage.getItem("email");
        const name = localStorage.getItem("name");
        const userImageUrl = localStorage.getItem("imageUrl");
        if (!authorId || !email || !name) return;
        const author = { email, name, imageUrl: userImageUrl || "" }
        const message = {
            author, type: "CALL", content: "VOICE", authorId,
            mediaUrl: "", callUrl: voiceCallUrl, chatId: selectedChat?.id, createdAt: Date.now()
        }
        socket.emit("send-message", message)
    }

    if (!selectedChat) {
        return (
            <div className="flex flex-col justify-center items-center h-full glass-strong rounded-2xl">
                <div className="text-center">
                    <div className="w-20 h-20 rounded-2xl bg-[var(--bg-tertiary)] flex items-center justify-center mx-auto mb-4">
                        <Send className="w-8 h-8 text-[var(--text-muted)]" />
                    </div>
                    <h2 className="text-xl font-semibold text-[var(--text-primary)] mb-2">Select a conversation</h2>
                    <p className="text-sm text-[var(--text-muted)]">Choose a chat from the sidebar to start messaging</p>
                </div>
            </div>
        )
    }

    return (
        <div className="flex flex-col h-full rounded-2xl glass-strong overflow-hidden">
            {/* Header */}
            <div className="flex justify-between items-center px-5 py-3 border-b border-[var(--border-subtle)]">
                <div className="flex gap-3 items-center">
                    <div className="relative">
                        {selectedChat.otherImageUrl ? (
                            <div className="h-10 w-10 relative rounded-full ring-2 ring-[var(--border-subtle)]">
                                <Image
                                    src={selectedChat.otherImageUrl}
                                    alt="profile"
                                    fill
                                    className="rounded-full object-cover"
                                />
                            </div>
                        ) : (
                            <div className="w-10 h-10 rounded-full bg-[var(--bg-tertiary)] flex items-center justify-center ring-2 ring-[var(--border-subtle)]">
                                {selectedChat.isGroupChat ? (
                                    <Users className="w-5 h-5 text-[var(--text-muted)]" />
                                ) : (
                                    <User className="w-5 h-5 text-[var(--text-muted)]" />
                                )}
                            </div>
                        )}
                        <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-emerald-500 rounded-full border-2 border-[var(--bg-secondary)]" />
                    </div>
                    <div className="flex flex-col">
                        <p className="text-sm font-semibold text-[var(--text-primary)]">{selectedChat.name}</p>
                        <p className="text-xs text-emerald-400">Online</p>
                    </div>
                </div>

                <div className="flex items-center gap-2">
                    <button
                        onClick={handleVoiceCall}
                        className="p-2.5 rounded-xl glass glass-hover transition-all duration-200 hover:scale-105 active:scale-95 cursor-pointer group"
                        title="Voice Call"
                    >
                        <Phone className="w-5 h-5 text-[var(--text-secondary)] group-hover:text-emerald-400 transition-colors" />
                    </button>
                    <button
                        onClick={handleVideoCall}
                        className="p-2.5 rounded-xl glass glass-hover transition-all duration-200 hover:scale-105 active:scale-95 cursor-pointer group"
                        title="Video Call"
                    >
                        <Video className="w-5 h-5 text-[var(--text-secondary)] group-hover:text-indigo-400 transition-colors" />
                    </button>
                </div>
            </div>

            {/* Messages Area */}
            <div className="flex-1 px-5 py-3 overflow-y-auto">
                {selectedChat && selectedChat.chatMessages.length === 0 && (
                    <div className="flex justify-center items-center text-[var(--text-muted)] h-full">
                        <p className="text-sm italic">Start a conversation ✨</p>
                    </div>
                )}
                {selectedChat && selectedChat.chatMessages.map((message: ChatMessages, index: number) => (
                    <Message message={message} key={index} />
                ))}
                <div ref={messageEndRef} />
            </div>

            {/* File preview */}
            <AnimatePresence>
                {imageUrl && (
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: 20 }}
                        className="px-5 pb-2"
                    >
                        <div className="relative h-40 w-36 rounded-xl overflow-hidden border border-[var(--border-subtle)] shadow-xl">
                            <Image src={imageUrl} alt="preview" fill className="object-cover" />
                            <button
                                onClick={() => { setImageUrl(""); setFile(null); setInputDisabled(false); if (fileInputRef.current) fileInputRef.current.value = ""; }}
                                className="absolute top-2 right-2 p-1 rounded-full bg-black/60 hover:bg-black/80 text-white transition-all"
                            >
                                <X className="h-3.5 w-3.5" />
                            </button>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Input Bar */}
            <div className="px-4 py-3 border-t border-[var(--border-subtle)]">
                <div className="flex items-center gap-2">
                    <div className="relative flex-1">
                        <Input
                            className="w-full pl-4 pr-10 py-3 h-11 rounded-xl bg-[var(--bg-tertiary)] border-[var(--border-subtle)] text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus-glow transition-all duration-200"
                            placeholder="Type a message..."
                            disabled={inputDisabled}
                            onChange={(e) => setMessageContent(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter' && !e.shiftKey) {
                                    e.preventDefault();
                                    handleMessageSubmit();
                                }
                            }}
                            value={messageContent}
                        />
                        <Smile className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-muted)] cursor-pointer hover:text-[var(--text-secondary)] transition-colors" />
                    </div>

                    <input type="file" className="hidden" ref={fileInputRef} onChange={handleFileChange} />

                    <button
                        className="p-2.5 rounded-xl glass glass-hover transition-all duration-200 hover:scale-105 active:scale-95 cursor-pointer"
                        onClick={handleClick}
                    >
                        <PlusIcon className="w-5 h-5 text-[var(--text-secondary)]" />
                    </button>

                    <motion.button
                        whileTap={{ scale: 0.9 }}
                        className="p-2.5 rounded-xl bg-indigo-500 hover:bg-indigo-400 transition-all duration-200 shadow-lg shadow-indigo-500/20 cursor-pointer"
                        onClick={handleMessageSubmit}
                    >
                        <Send className="w-5 h-5 text-white" />
                    </motion.button>
                </div>
            </div>
        </div>
    )
}