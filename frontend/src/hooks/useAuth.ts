import { useEffect, useState } from "react";
import axios from 'axios';
import apiClient from '@/lib/axios';
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import logger from "@/utils/logger";

export const useAuth = (skipRedirect: boolean = false) => {
    const router = useRouter();
    const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
    const [isLoading, setIsLoading] = useState<boolean>(true);

    useEffect(() => {
        const checkAuth = async () => {
            logger.auth('Checking authentication status', { skipRedirect });
            try {
                // apiClient uses withCredentials to send the httpOnly cookie automatically
                
                // apiClient interceptor automatically adds token from localStorage to Authorization header
                const res = await apiClient.get(`/api/v1/user/checkauth`, {
                    withCredentials: true
                });

                logger.auth('Auth check response', { authenticated: res.data.authenticated });
                setIsAuthenticated(res.data.authenticated);

                // Only redirect if we're supposed to AND user is not authenticated
                if (!skipRedirect && !res.data.authenticated) {
                    logger.warn('User not authenticated, redirecting to login');
                    toast.error("Please sign in to access this page");
                    router.push("/login");
                }

            } catch (error: any) {
                logger.error('Error checking authentication', error, {
                    action: 'checkAuth',
                    skipRedirect,
                    errorMessage: error.message,
                    errorResponse: error.response?.data
                });
                setIsAuthenticated(false);
                
                if (!skipRedirect) {
                    toast.error("Something went wrong!");
                    router.push("/login");
                }
            } finally {
                setIsLoading(false);
            }
        }

        checkAuth();
    }, [router, skipRedirect]);

    return { isAuthenticated, isLoading }
}

export const useLogout = () => {
    const router = useRouter();
    const [isLoading, setIsLoading] = useState<boolean>(false);

    const doLogout = async () => {
        setIsLoading(true);
        logger.auth('Logging out user');

        try {
            await apiClient.get(`/api/v1/user/logout`, {
                withCredentials: true
            });

            // Clear localStorage on logout
            localStorage.removeItem('userId');
            localStorage.removeItem('name');
            localStorage.removeItem('imageUrl');
            localStorage.removeItem('email');

            logger.auth('Logout successful');
            toast.success("Logged out successfully!");
            router.push("/login");
        } catch (error) {
            logger.error('Error during logout', error, { action: 'logout' });
            // Clear localStorage even if request fails
            localStorage.removeItem('userId');
            localStorage.removeItem('name');
            localStorage.removeItem('imageUrl');
            localStorage.removeItem('email');
            toast.error("Internal Server Error !");
        } finally {
            setIsLoading(false);
        }
    };

    return { isLoading, doLogout };
};
