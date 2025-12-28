import type { Metadata } from "next";
import { Inter } from "next/font/google";
// @ts-ignore
import "./globals.css";
import { Toaster } from "@/components/ui/sonner";
import { ThemeProvider } from "@/components/ThemeProvider";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "StreamLy — Real-time Chat & Video",
  description: "Modern communication platform with real-time messaging, video calling, and media sharing",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${inter.variable} font-sans antialiased`}
        style={{ fontFamily: "var(--font-inter), system-ui, sans-serif" }}
      >
        <ThemeProvider
          attribute="class"
          defaultTheme="dark"
          enableSystem
          disableTransitionOnChange
        >
          {children}
          <Toaster
            position="top-center"
            toastOptions={{
              className: "border border-[var(--border-default)] bg-[var(--bg-tertiary)] text-[var(--text-primary)]",
              style: {
                background: "var(--bg-tertiary)",
                borderColor: "var(--border-default)",
                color: "var(--text-primary)",
              },
            }}
          />
        </ThemeProvider>
      </body>
    </html>
  );
}
