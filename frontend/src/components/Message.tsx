"use client"
import { Avatar, AvatarFallback, AvatarImage } from "./ui/avatar"
import { Video, Phone } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { motion } from "framer-motion";

export const Message = ({ message }: any) => {
  const userId = typeof window !== "undefined" ? localStorage.getItem("userId") : null;
  const isOwn = userId === message?.authorId;

  const formatted = new Date(message?.createdAt).toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });

  const isVoiceCall = message?.type === "CALL" && message?.content === "VOICE";

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, ease: "easeOut" }}
      className={`mt-3 flex ${isOwn ? "justify-end" : "justify-start"}`}
    >
      <div className="flex gap-2.5 max-w-[75%]">
        {!isOwn && (
          <Avatar className="w-8 h-8 mt-1 flex-shrink-0">
            <AvatarImage className="h-8 w-8" src={message?.author?.imageUrl} />
            <AvatarFallback className="bg-[var(--bg-tertiary)] text-xs text-[var(--text-secondary)]">
              {message?.author.name.slice(0, 2).toUpperCase()}
            </AvatarFallback>
          </Avatar>
        )}
        <div className="flex flex-col">
          <div className={`flex items-center gap-2 mb-1 ${isOwn ? "justify-end" : "justify-start"}`}>
            <p className="text-xs font-medium text-[var(--text-secondary)]">
              {isOwn ? "You" : message?.author?.name}
            </p>
            <p className="text-[10px] text-[var(--text-muted)]">{formatted}</p>
          </div>

          {message?.type === "TEXT" && (
            <TextMessage isOwn={isOwn} content={message.content} />
          )}
          {message?.type === "MEDIA" && (
            <MediaMessage isOwn={isOwn} message={message} />
          )}
          {message?.type === "CALL" && (
            <CallMessage isOwn={isOwn} url={message.callUrl} isVoice={isVoiceCall} isCallEnded={message.isCallEnded} />
          )}
        </div>
      </div>
    </motion.div>
  )
}

const TextMessage = ({ isOwn, content }: { isOwn: boolean, content: string }) => {
  return (
    <div className={isOwn ? "msg-own px-4 py-2.5 shadow-lg shadow-indigo-500/10" : "msg-other px-4 py-2.5"}>
      <p className="text-sm leading-relaxed">{content}</p>
    </div>
  )
}

const MediaMessage = ({ isOwn, message }: { message: any, isOwn: boolean }) => {
  return (
    <div className={`mt-1 ${isOwn ? "self-end" : "self-start"}`}>
      <div className="rounded-2xl overflow-hidden border border-[var(--border-subtle)] shadow-lg">
        <img
          src={message?.mediaUrl || "/man.jpg"}
          alt="media"
          className="max-w-[280px] max-h-[300px] object-cover"
        />
      </div>
    </div>
  )
}

const CallMessage = ({ isOwn, url, isVoice, isCallEnded }: { isOwn: boolean, url: string, isVoice: boolean, isCallEnded?: boolean }) => {
  const Icon = isVoice ? Phone : Video;
  const label = isVoice ? "Voice Call" : "Video Call";
  const ownGradient = isVoice
    ? "bg-gradient-to-r from-emerald-500/20 to-teal-500/20 border border-emerald-500/20"
    : "bg-gradient-to-r from-indigo-500/20 to-purple-500/20 border border-indigo-500/20";
  const otherGradient = isVoice
    ? "bg-gradient-to-r from-emerald-500/10 to-teal-500/10 border border-emerald-500/20"
    : "bg-gradient-to-r from-emerald-500/10 to-teal-500/10 border border-emerald-500/20";
  const ownAccent = isVoice ? "text-emerald-300" : "text-indigo-300";
  const otherAccent = isVoice ? "text-emerald-300" : "text-emerald-300";
  const ownIconBg = isVoice ? "bg-emerald-500/20" : "bg-indigo-500/20";
  const otherIconBg = isVoice ? "bg-emerald-500/20" : "bg-emerald-500/20";
  const ownIconColor = isVoice ? "text-emerald-400" : "text-indigo-400";
  const otherIconColor = isVoice ? "text-emerald-400" : "text-emerald-400";

  // Voice calls open with ?mode=audio, video calls open without
  const callUrl = isVoice ? `/call/${url}?mode=audio` : `/call/${url}`;

  if (isCallEnded) {
    return (
      <div className="flex items-center gap-3 px-4 py-3 mt-1 rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-tertiary)]/50 opacity-60 cursor-not-allowed select-none">
        <div className="p-2 rounded-full bg-[var(--bg-secondary)] text-[var(--text-muted)]">
          <Icon className="w-4 h-4 text-neutral-400" />
        </div>
        <div>
          <div className="text-sm font-medium text-[var(--text-secondary)]">
            {isOwn ? "You started " : ""}{label}
          </div>
          <div className="text-xs text-[var(--text-muted)]">Call Ended</div>
        </div>
      </div>
    );
  }

  return (
    <Dialog>
      <DialogTrigger asChild>
        <div className={`flex items-center gap-3 px-4 py-3 mt-1 rounded-2xl cursor-pointer transition-all duration-200 hover:scale-[1.02] active:scale-[0.98]
          ${isOwn ? ownGradient : otherGradient}`}
        >
          <div className={`p-2 rounded-full ${isOwn ? ownIconBg : otherIconBg}`}>
            <Icon className={`w-4 h-4 ${isOwn ? ownIconColor : otherIconColor}`} />
          </div>
          <div>
            <div className={`text-sm font-medium ${isOwn ? ownAccent : otherAccent}`}>
              {isOwn ? "You started " : ""}{label}
            </div>
            <div className="text-xs text-[var(--text-muted)]">Tap to join</div>
          </div>
        </div>
      </DialogTrigger>

      <DialogContent className="sm:max-w-sm bg-[var(--bg-secondary)] border border-[var(--border-default)]">
        <DialogHeader>
          <DialogTitle className="text-[var(--text-primary)]">Join {label}</DialogTitle>
          <DialogDescription className="text-[var(--text-secondary)]">
            {isVoice
              ? "You'll be connected via audio only"
              : "You'll be connected via video and audio"
            }
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="flex justify-around mt-4">
          <Button
            className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl px-6 transition-all duration-200 shadow-lg shadow-emerald-500/20 cursor-pointer"
            onClick={() => window.open(callUrl, "_blank")}
          >
            <Icon className="w-4 h-4" />
            Join {label}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};