'use client'

import { useState, useEffect } from "react"
import { motion } from "framer-motion"
import { Button } from "./ui/button"
import { Label } from "@radix-ui/react-label"
import { Loader2, Eye, EyeOff, Mail, Lock } from "lucide-react"
import { Toaster, toast } from "sonner"
import { Input } from "./ui/input"
import Image from "next/image"
import Link from "next/link"
import { useRouter } from "next/navigation"
import apiClient from '@/lib/axios';
import { useAuth } from "@/hooks/useAuth"
import logger from "@/utils/logger";

interface LoginFormData {
    email: string
    password: string
}

const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
        opacity: 1,
        transition: { staggerChildren: 0.08, delayChildren: 0.1 }
    }
};

const itemVariants = {
    hidden: { opacity: 0, y: 16 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.4, ease: [0.25, 0.46, 0.45, 0.94] as any } }
};

export default function Login() {
    const router = useRouter();
    const [formData, setFormData] = useState<LoginFormData>({
        email: "",
        password: ""
    });
    const [error, setError] = useState("");
    const [isLoading, setIsLoading] = useState(false);
    const [showPassword, setShowPassword] = useState(false);
    const { isLoading: loading, isAuthenticated } = useAuth(true);

    useEffect(() => {
        if (!loading && isAuthenticated) {
            router.push('/');
        }
    }, [loading, isAuthenticated, router]);

    const validateForm = () => {
        const { email, password } = formData;
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!email.trim()) return "Email is required";
        if (!emailRegex.test(email)) return "Enter a valid email address";
        if (!password.trim()) return "Password is required";
        if (password.length < 6) return "Password must be at least 6 characters long";
        return "";
    };

    const handleSubmit = async (e: any) => {
        e.preventDefault();
        const validationError = validateForm();
        if (validationError) {
            logger.warn('Login validation failed', { error: validationError });
            toast.error(validationError);
            return;
        }

        logger.auth('Login attempt', { email: formData.email });
        try {
            setIsLoading(true)
            const response = await apiClient.post(`/api/v1/user/login`, formData, {
                headers: { "Content-Type": "application/json" },
                withCredentials: true
            })

            logger.auth('Login successful', {
                userId: response.data.userId,
                email: formData.email,
                name: response.data.name,
                hasToken: !!response.data.token,
                responseKeys: Object.keys(response.data)
            });

            logger.auth('Login successful, relying on httpOnly cookie', {
                hasToken: false
            });

            setIsLoading(false);
            toast.success("Welcome back! 🎉")
            localStorage.setItem("userId", response.data.userId);
            localStorage.setItem("name", response.data.name);
            localStorage.setItem("imageUrl", response.data.imageUrl);
            localStorage.setItem("email", response.data.email)
            router.push('/');
        } catch (error: any) {
            logger.error('Login failed', error, {
                action: 'login',
                email: formData.email,
                errorMessage: error.response?.data?.message || error.message,
                errorStatus: error.response?.status,
                errorResponse: error.response?.data
            });
            setError(error.response?.data?.message || "An error occurred during login");
        } finally {
            setIsLoading(false);
        }
    }

    return (
        <>
            <div className="relative min-h-screen flex items-center justify-center overflow-hidden"
                style={{ background: "linear-gradient(135deg, var(--bg-gradient-start) 0%, var(--bg-gradient-mid) 40%, var(--bg-gradient-end) 100%)" }}>

                {/* Ambient glow effects */}
                <div className="absolute top-1/4 -left-32 w-96 h-96 bg-indigo-500/5 rounded-full blur-3xl" />
                <div className="absolute bottom-1/4 -right-32 w-96 h-96 bg-purple-500/5 rounded-full blur-3xl" />

                <motion.div
                    initial={{ opacity: 0, scale: 0.96 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ duration: 0.5, ease: "easeOut" }}
                    className="relative z-10 w-full max-w-md mx-4"
                >
                    {/* Glass card */}
                    <div className="glass-strong rounded-2xl p-8 shadow-2xl">
                        {/* Accent line */}
                        <div className="absolute top-0 left-8 right-8 h-px bg-gradient-to-r from-transparent via-indigo-500/50 to-transparent" />

                        <motion.div
                            variants={containerVariants}
                            initial="hidden"
                            animate="visible"
                        >
                            {/* Header */}
                            <motion.div variants={itemVariants} className="text-center mb-8">
                                <h1 className="text-3xl font-bold bg-gradient-to-r from-white to-gray-400 bg-clip-text text-transparent">
                                    Welcome Back
                                </h1>
                                <p className="text-sm text-[var(--text-secondary)] mt-2">
                                    Sign in to continue your conversations
                                </p>
                            </motion.div>

                            {/* Google button */}
                            <motion.div variants={itemVariants}>
                                <button
                                    className="w-full flex items-center justify-center gap-3 px-4 py-3 rounded-xl glass glass-hover transition-all duration-200 cursor-pointer group"
                                    onClick={() => toast.info("Google sign-in coming soon!")}
                                >
                                    <Image src="/google.png" alt="Google" width={18} height={18} />
                                    <span className="text-sm font-medium text-[var(--text-secondary)] group-hover:text-[var(--text-primary)] transition-colors">
                                        Continue with Google
                                    </span>
                                </button>
                            </motion.div>

                            {/* Divider */}
                            <motion.div variants={itemVariants} className="relative my-6">
                                <div className="absolute inset-0 flex items-center">
                                    <div className="w-full h-px bg-[var(--border-subtle)]" />
                                </div>
                                <div className="relative flex justify-center">
                                    <span className="px-3 text-xs uppercase text-[var(--text-muted)] bg-[var(--bg-secondary)]">
                                        or continue with email
                                    </span>
                                </div>
                            </motion.div>

                            {/* Form */}
                            <form className="space-y-4" onSubmit={handleSubmit}>
                                <motion.div variants={itemVariants} className="space-y-2">
                                    <Label className="text-xs font-medium text-[var(--text-secondary)]">Email</Label>
                                    <div className="relative">
                                        <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-muted)]" />
                                        <Input
                                            placeholder="you@example.com"
                                            required
                                            type="email"
                                            className="pl-10 h-11 rounded-xl bg-[var(--bg-tertiary)] border-[var(--border-subtle)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus-glow transition-all duration-200"
                                            onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                                        />
                                    </div>
                                </motion.div>

                                <motion.div variants={itemVariants} className="space-y-2">
                                    <Label className="text-xs font-medium text-[var(--text-secondary)]">Password</Label>
                                    <div className="relative">
                                        <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-muted)]" />
                                        <Input
                                            placeholder="••••••••"
                                            required
                                            type={showPassword ? "text" : "password"}
                                            className="pl-10 pr-10 h-11 rounded-xl bg-[var(--bg-tertiary)] border-[var(--border-subtle)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus-glow transition-all duration-200"
                                            onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                                        />
                                        <button
                                            type="button"
                                            className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)] hover:text-[var(--text-secondary)] transition-colors"
                                            onClick={() => setShowPassword(!showPassword)}
                                        >
                                            {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                                        </button>
                                    </div>
                                </motion.div>

                                {error && (
                                    <motion.div
                                        initial={{ opacity: 0, y: -8 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        className="text-red-400 text-sm text-center py-2 px-3 rounded-lg bg-red-500/10 border border-red-500/20"
                                    >
                                        {error}
                                    </motion.div>
                                )}

                                <motion.div variants={itemVariants}>
                                    <Button
                                        className="w-full h-11 rounded-xl bg-gradient-to-r from-indigo-600 to-indigo-500 hover:from-indigo-500 hover:to-indigo-400 text-white font-medium transition-all duration-200 shadow-lg shadow-indigo-500/20 hover:shadow-indigo-500/30 cursor-pointer"
                                        type="submit"
                                        disabled={isLoading}
                                    >
                                        {isLoading ? (
                                            <>
                                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                                Signing in...
                                            </>
                                        ) : (
                                            "Sign In"
                                        )}
                                    </Button>
                                </motion.div>
                            </form>

                            <motion.p
                                variants={itemVariants}
                                className="text-sm text-center mt-6 text-[var(--text-secondary)]"
                            >
                                Don&apos;t have an account?{" "}
                                <Link href="/signup" className="text-indigo-400 hover:text-indigo-300 font-medium transition-colors">
                                    Create account
                                </Link>
                            </motion.p>
                        </motion.div>
                    </div>
                </motion.div>
            </div>
        </>
    )
}