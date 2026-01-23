import { Sheet, SheetContent, SheetTitle, SheetTrigger, SheetClose } from "./ui/sheet";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { UserPlus, Plus } from "lucide-react";
import { useUsers, useCreateChat } from "@/hooks/userHooks";
import { Loader2 } from "lucide-react";

type UserSheetProps = {
    onAddChat: () => void
}

export const UserSheet = ({ onAddChat }: UserSheetProps) => {
    const { users, isLoading, fetchUsers } = useUsers();
    const { isLoading: createChatLoading, createChat } = useCreateChat();

    const handleCreateChat = (name: string, imageUrl: string, id: string, email: string) => {
        createChat({ name, imageUrl, id, email }).then(() => {
            fetchUsers();
            onAddChat();
        });
    }

    return (
        <Sheet>
            <SheetTrigger asChild>
                <button
                    className="p-2.5 rounded-xl glass glass-hover transition-all duration-200 hover:scale-105 active:scale-95 cursor-pointer"
                    onClick={() => fetchUsers()}
                >
                    <UserPlus className="h-4 w-4 text-[var(--text-secondary)]" />
                </button>
            </SheetTrigger>
            <SheetContent className="bg-[var(--bg-secondary)] border-l border-[var(--border-default)] p-0">
                {(createChatLoading || isLoading) && (
                    <div className="absolute inset-0 flex items-center justify-center bg-[var(--bg-primary)]/70 z-50 backdrop-blur-sm">
                        <Loader2 className="h-8 w-8 animate-spin text-indigo-400" />
                    </div>
                )}

                <div className="p-5">
                    <SheetTitle className="text-lg font-semibold text-[var(--text-primary)]">
                        Add a friend
                    </SheetTitle>
                    <p className="text-xs text-[var(--text-muted)] mt-1">Start a new conversation</p>
                </div>

                <div className="px-5 space-y-4">
                    <Input
                        type="search"
                        placeholder="Search people..."
                        className="w-full rounded-xl bg-[var(--bg-tertiary)] border-[var(--border-subtle)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus-glow"
                    />

                    <div className="space-y-2">
                        {users && users.length === 0 ? (
                            <p className="text-center text-[var(--text-muted)] py-8 text-sm">No users found</p>
                        ) : (
                            users.map((user, index) => (
                                <div
                                    key={index}
                                    className="flex items-center justify-between p-3 rounded-xl glass glass-hover transition-all duration-200"
                                >
                                    <div className="flex items-center space-x-3">
                                        <Avatar className="h-10 w-10 ring-2 ring-[var(--border-subtle)]">
                                            <AvatarImage src={user.imageUrl} alt={user.name} />
                                            <AvatarFallback className="bg-[var(--bg-tertiary)] text-[var(--text-secondary)] text-xs">
                                                {user.name.slice(0, 2).toUpperCase()}
                                            </AvatarFallback>
                                        </Avatar>
                                        <span className="font-medium text-sm text-[var(--text-primary)]">{user.name}</span>
                                    </div>

                                    <SheetClose asChild>
                                        <Button
                                            size="icon"
                                            className="h-8 w-8 rounded-lg bg-indigo-500/10 hover:bg-indigo-500/20 border border-indigo-500/20 cursor-pointer transition-all duration-200"
                                            onClick={() => handleCreateChat(user.name, user.imageUrl, user.id, user.email)}
                                        >
                                            <Plus className="h-4 w-4 text-indigo-400" />
                                        </Button>
                                    </SheetClose>
                                </div>
                            ))
                        )}
                    </div>
                </div>
            </SheetContent>
        </Sheet>
    )
}