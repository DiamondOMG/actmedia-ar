import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { ClerkProvider } from "@clerk/nextjs";
import Script from "next/script";
import XRGuard from "@/components/ar-core/xr_guard";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "AR Navigate - WebAR In-Store Navigation",
  description: "Indoor AR Navigation using 8th Wall and Next.js",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <ClerkProvider>
      <html
        lang="en"
        className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
        suppressHydrationWarning
      >
        <head>
          {/* 8th Wall Engine Binary (SLAM) */}
          <Script 
            src="https://cdn.jsdelivr.net/npm/@8thwall/engine-binary@1/dist/xr.js"
            strategy="beforeInteractive"
            crossOrigin="anonymous"
            data-preload-chunks="slam"
          />
          {/* 8th Wall XR Extras */}
          <Script 
            src="https://cdn.jsdelivr.net/npm/@8thwall/xrextras@1/dist/xrextras.js"
            strategy="beforeInteractive"
            crossOrigin="anonymous"
          />
          {/* 8th Wall Landing Page */}
          <Script 
            src="https://cdn.jsdelivr.net/npm/@8thwall/landing-page@1/dist/landing-page.js"
            strategy="beforeInteractive"
            crossOrigin="anonymous"
          />
        </head>
        <body className="min-h-full flex flex-col" suppressHydrationWarning>
          <XRGuard />
          {children}
        </body>
      </html>
    </ClerkProvider>
  );
}
