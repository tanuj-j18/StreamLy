export interface ApiResponse<T = any>
{
    success: boolean;
    message?: string;
    data?: T;
    error?: string;
    errors?: Record<string, string[]>;
}

export interface PaginatedResponse<T> extends ApiResponse<T[]>
{
    pagination: {
        page: number;
        limit: number;
        total: number;
        totalPages: number;
    };
}

export interface UserResponse
{
    id: string;
    email: string;
    username: string;
    avatar?: string;
    createdAt: string;
    updatedAt: string;
}

export interface ChatResponse
{
    id: string;
    name?: string;
    isGroup: boolean;
    createdAt: string;
    updatedAt: string;
    participants: UserResponse[];
    lastMessage?: MessageResponse;
}

export interface MessageResponse
{
    id: string;
    content?: string;
    type: 'TEXT' | 'IMAGE' | 'FILE' | 'VIDEO' | 'AUDIO';
    fileUrl?: string;
    fileName?: string;
    fileSize?: number;
    senderId: string;
    chatId: string;
    createdAt: string;
    updatedAt: string;
    sender: UserResponse;
}

export interface AuthResponse
{
    user: UserResponse;
    token: string;
}

export interface FileUploadResponse
{
    url: string;
    fileName: string;
    fileSize: number;
    fileType: string;
}

// Socket.io event types
export interface SocketEvents
{
    // Client to Server
    join_chat: (chatId: string) => void;
    leave_chat: (chatId: string) => void;
    send_message: (data: {
        chatId: string;
        message?: string;
        type?: MessageResponse['type'];
        fileUrl?: string;
        fileName?: string;
        fileSize?: number;
        tempId?: string;
    }) => void;
    typing_start: (chatId: string) => void;
    typing_stop: (chatId: string) => void;
    mark_messages_read: (data: { chatId: string; messageIds: string[] }) => void;
    get_online_users: () => void;

    // Server to Client
    new_message: (message: MessageResponse) => void;
    message_delivered: (data: { tempId?: string; messageId: string; timestamp: string }) => void;
    message_error: (data: { error: string; tempId?: string }) => void;
    user_online: (data: { userId: string; username: string }) => void;
    user_offline: (data: { userId: string; username: string }) => void;
    user_typing: (data: { userId: string; username: string; chatId: string }) => void;
    user_stop_typing: (data: { userId: string; username: string; chatId: string }) => void;
    messages_read: (data: { userId: string; chatId: string; messageIds: string[] }) => void;
    online_users: (users: Array<{ userId: string; username: string }>) => void;
    error: (data: { message: string }) => void;
}
