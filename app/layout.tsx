import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { InlineScript } from "./components/inline-script";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "VRA - Real Estate", template: "%s | VRA - Real Estate" },
  description: "Secure real estate customer relationship and sales management.",
};

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${inter.variable} h-full antialiased`} suppressHydrationWarning>
      <head>
        <InlineScript
          html={`(function(){try{if(localStorage.getItem('vra-theme')==='dark'||(!localStorage.getItem('vra-theme')&&matchMedia('(prefers-color-scheme: dark)').matches))document.documentElement.classList.add('dark')}catch(e){}})()`}
        />
      </head>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
