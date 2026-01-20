"use client"
import { useState } from "react"
import { Check, Loader2, Users } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { useGetUsersForGroupChat } from "@/hooks/userHooks";
import { useCreateGroupChat } from "@/hooks/chatHooks"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { cn } from "@/lib/utils"
import { toast } from "sonner"

type GroupDialogProps = {
  onAddChat: () => void
}

export function GroupDialog({ onAddChat }: GroupDialogProps) {
  const { users, getUsers, isLoading } = useGetUsersForGroupChat();
  const [selectedUsers, setSelectedUsers] = useState<string[]>([]);
  const { createGroupChat, isSubmitting } = useCreateGroupChat();
  const [groupName, setGroupName] = useState<string>();

  const toggleUserSelection = (userId: string) => {
    setSelectedUsers((prev) =>
      prev.includes(userId)
        ? prev.filter((id) => id !== userId)
        : [...prev, userId]
    )
  }

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const userId = localStorage.getItem("userId");
    if (!userId) return;
    if (groupName == null || !groupName) {
      toast.error("Group name cannot be empty");
      return
    }
    const finalUserIds = [...selectedUsers, userId];
    const dataToSend = { userIds: finalUserIds, name: groupName, adminId: userId }
    createGroupChat(dataToSend).then(() => { onAddChat(); })
  }

  return (
    <Dialog>
      <DialogTrigger asChild>
        <button
          onClick={getUsers}
          className="p-2.5 rounded-xl glass glass-hover transition-all duration-200 hover:scale-105 active:scale-95 cursor-pointer"
        >
          <Users className="h-4 w-4 text-[var(--text-secondary)]" />
        </button>
      </DialogTrigger>

      <DialogContent className="sm:max-w-[425px] bg-[var(--bg-secondary)] border border-[var(--border-default)] rounded-2xl">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle className="text-[var(--text-primary)]">Create Group Chat</DialogTitle>
            <DialogDescription className="text-[var(--text-secondary)]">
              Add a name and select members for your group.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="name" className="text-xs text-[var(--text-secondary)]">Group Name</Label>
              <Input
                onChange={(e) => setGroupName(e.target.value)}
                id="name"
                placeholder="Enter group name"
                className="rounded-xl bg-[var(--bg-tertiary)] border-[var(--border-subtle)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus-glow"
              />
            </div>

            <div className="grid gap-2">
              <Label className="text-xs text-[var(--text-secondary)]">
                Select Members {selectedUsers.length > 0 && `(${selectedUsers.length})`}
              </Label>
              <ScrollArea className="h-[200px] rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-tertiary)] p-2">
                {isLoading ? (
                  <div className="flex justify-center items-center h-[180px]">
                    <Loader2 className="h-6 w-6 animate-spin text-[var(--text-muted)]" />
                  </div>
                ) : (
                  <div className="space-y-1">
                    {users?.map((user: any) => (
                      <div
                        key={user.id}
                        onClick={() => toggleUserSelection(user.id)}
                        className={cn(
                          "flex items-center space-x-3 rounded-lg p-2.5 cursor-pointer transition-all duration-200",
                          selectedUsers.includes(user.id)
                            ? "bg-indigo-500/10 border border-indigo-500/20"
                            : "hover:bg-[var(--glass-hover)] border border-transparent"
                        )}
                      >
                        <Avatar className="h-8 w-8 ring-1 ring-[var(--border-subtle)]">
                          <AvatarImage src={user.imageUrl} alt={user.name} />
                          <AvatarFallback className="bg-[var(--bg-elevated)] text-[var(--text-secondary)] text-xs">
                            {user.name?.charAt(0).toUpperCase() || "U"}
                          </AvatarFallback>
                        </Avatar>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-[var(--text-primary)] truncate">{user.name}</p>
                          <p className="text-xs text-[var(--text-muted)] truncate">{user.email}</p>
                        </div>
                        {selectedUsers.includes(user.id) && (
                          <div className="w-5 h-5 rounded-full bg-indigo-500 flex items-center justify-center">
                            <Check className="h-3 w-3 text-white" />
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </ScrollArea>
            </div>
          </div>

          <DialogFooter>
            <Button
              disabled={isLoading || isSubmitting}
              className="bg-indigo-500 hover:bg-indigo-400 text-white rounded-xl px-6 transition-all duration-200 shadow-lg shadow-indigo-500/20 cursor-pointer"
            >
              {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Create Group
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
