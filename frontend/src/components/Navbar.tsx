"use client"
import { useState, useEffect } from "react"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { useRef } from "react"
import { useLogout } from "@/hooks/useAuth"
import axios from "axios"
import { LogOut, Camera } from "lucide-react"
import { ThemeToggle } from "./ThemeToggle"

export const Navbar = () => {
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const [imageUrl, setImageUrl] = useState();
  const [fetchAgain, setFetchAgain] = useState<number>(0);
  const [fallbackName, setFallbackName] = useState<string>();
  const { doLogout, isLoading } = useLogout();

  useEffect(() => {
    const userId = localStorage.userId;
    if (!userId) return;
    axios.get(`${process.env.NEXT_PUBLIC_BACKEND_URL}/api/v1/upload/get-profile-pic/${userId}`, {
      withCredentials: true
    })
      .then((res) => {
        if (res.data.url) {
          setImageUrl(res.data.url);
          localStorage.setItem("imageUrl", res.data.url);
        }
      })
      .catch((error) => {
        console.log("Something went wrong while fetching the image", error);
      })
  }, [fetchAgain]);

  useEffect(() => {
    const name = localStorage.getItem("name");
    if (!name) return;
    setFallbackName(name);
  }, [])

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const userId = localStorage.getItem("userId");
      if (!userId) return;
      const fileType = encodeURIComponent(file.type);
      const res = await axios.get(
        `${process.env.NEXT_PUBLIC_BACKEND_URL}/api/v1/upload/upload-profile-pic/${userId}?fileType=${fileType}`
      );
      const uploadUrl = res.data.url;
      if (!uploadUrl) return;
      await axios.put(uploadUrl, file, { headers: { "Content-Type": file.type } });
      setFetchAgain((prev) => prev + 1);
    } catch (error) {
      console.error("Error during image upload process:", error);
    }
  };

  return (
    <div className="flex justify-between items-center px-4 py-3 border-t border-[var(--border-subtle)]">
      <Button
        className="bg-transparent text-red-500 border border-red-500/20 hover:bg-red-500/10 hover:text-red-600 dark:text-red-400 dark:hover:text-red-300 rounded-xl text-xs px-4 h-9 transition-all duration-200 cursor-pointer"
        onClick={doLogout}
      >
        <LogOut className="w-3.5 h-3.5 mr-1.5" />
        {isLoading ? "..." : "Logout"}
      </Button>

      <div className="flex items-center gap-2">
        <ThemeToggle />

        <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button className="relative rounded-full transition-all duration-200 hover:ring-2 hover:ring-indigo-500/30 cursor-pointer">
            <Avatar className="h-9 w-9 ring-2 ring-[var(--border-subtle)]">
              <AvatarImage src={imageUrl} alt="User" />
              <AvatarFallback className="bg-[var(--bg-tertiary)] text-[var(--text-secondary)] text-xs">
                {fallbackName?.slice(0, 2).toUpperCase()}
              </AvatarFallback>
            </Avatar>
          </button>
        </DropdownMenuTrigger>

        <DropdownMenuContent
          align="end"
          className="w-44 bg-[var(--bg-secondary)] border border-[var(--border-default)] rounded-xl shadow-xl"
        >
          <DropdownMenuItem
            onSelect={(e) => { e.preventDefault(); fileInputRef.current?.click() }}
            className="cursor-pointer text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--glass-hover)] rounded-lg"
          >
            <Camera className="w-4 h-4 mr-2" />
            Change photo
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleFileChange}
      />
    </div>
  )
}