import axios from 'axios';

// Create axios instance with default config
const apiClient = axios.create({
  baseURL: process.env.NEXT_PUBLIC_BACKEND_URL,
  withCredentials: true,
});

// No need for interceptor since we use httpOnly cookies with withCredentials: true

export default apiClient;
