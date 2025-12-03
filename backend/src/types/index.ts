export interface User
{
    id: string;
    email: string;
    username: string;
    avatar?: string;
    createdAt: Date;
    updatedAt: Date;
}

export interface Chat
{
    id: string;
    name?: string;
    isGroup: boolean;
    createdAt: Date;
    updatedAt: Date;
}

export interface Message
{
    id: string;
    content?: string;
    type: 'TEXT' | 'IMAGE' | 'FILE' | 'VIDEO';
    senderId: string;
    chatId: string;
    createdAt: Date;
}

export interface AuthResponse
{
    user: User;
    token: string;
}

export interface ApiResponse<T = any>
{
    success: boolean;
    data?: T;
    message?: string;
    error?: string;
}
