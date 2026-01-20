"use client"

import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"

export const ChatSidebarSkeleton = () => {
  return (
    <div className="flex flex-col w-full h-full rounded-2xl glass-strong overflow-hidden">
      {/* Header */}
      <div className="px-4 pt-5 pb-4">
        <Skeleton className="h-5 w-24 rounded-lg bg-[var(--bg-tertiary)] mb-4" />
        <div className="flex items-center gap-2">
          <Skeleton className="h-10 flex-1 rounded-xl bg-[var(--bg-tertiary)]" />
          <Skeleton className="h-10 w-10 rounded-xl bg-[var(--bg-tertiary)]" />
          <Skeleton className="h-10 w-10 rounded-xl bg-[var(--bg-tertiary)]" />
        </div>
      </div>

      {/* Chat list */}
      <div className="flex-1 overflow-y-auto px-2 pb-2">
        {Array.from({ length: 8 }).map((_, i) => (
          <ChatCardSkeleton key={i} index={i} />
        ))}
      </div>

      {/* Bottom */}
      <div className="flex justify-between items-center px-4 py-3 border-t border-[var(--border-subtle)]">
        <Skeleton className="h-9 w-20 rounded-xl bg-[var(--bg-tertiary)]" />
        <Skeleton className="h-9 w-9 rounded-full bg-[var(--bg-tertiary)]" />
      </div>
    </div>
  )
}

const ChatCardSkeleton = ({ index }: { index: number }) => {
  return (
    <div
      className="flex justify-between items-center p-3 mx-1 my-0.5 rounded-xl"
      style={{ animationDelay: `${index * 0.08}s` }}
    >
      <div className="flex gap-3 items-center flex-1">
        <Skeleton className="h-11 w-11 rounded-full bg-[var(--bg-tertiary)] flex-shrink-0 animate-shimmer" />
        <div className="flex flex-col gap-2 flex-1 min-w-0">
          <Skeleton
            className={cn(
              "h-3.5 rounded-md bg-[var(--bg-tertiary)] animate-shimmer",
              index % 3 === 0 ? "w-28" : index % 3 === 1 ? "w-20" : "w-24"
            )}
          />
          <Skeleton
            className={cn(
              "h-3 rounded-md bg-[var(--bg-tertiary)] animate-shimmer",
              index % 4 === 0 ? "w-40" : index % 4 === 1 ? "w-32" : "w-36"
            )}
          />
        </div>
      </div>
      <div className="flex flex-col items-end gap-2 ml-3">
        <Skeleton className="h-2.5 w-10 rounded-md bg-[var(--bg-tertiary)]" />
        {(index + 1) % 3 === 0 && (
          <Skeleton className="h-5 w-5 rounded-full bg-indigo-500/10" />
        )}
      </div>
    </div>
  )
}

export const CompactChatSidebarSkeleton = ChatSidebarSkeleton;