import type { Metadata } from "next";
import { Inter } from "next/font/google";
import localFont from "next/font/local";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";
import QueryProvider from "@/components/QueryProvider";
import SplashScreen from "@/components/SplashScreen";

const inter = Inter({ subsets: ["latin"] });

const geistMono = localFont({
  src: "./fonts/GeistMonoVF.woff",
  variable: "--font-geist-mono",
});

export const metadata: Metadata = {
  title: "VitallCam - Excelência em diagnóstico",
  description: "Sistema completo para captura e gestão de fotos intraorais",
  icons: {
    icon: "/icon.png",
    shortcut: "/icon.png",
    apple: "/icon.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <head>
        <link rel="preload" as="image" href="/icon.png" />
        <link rel="preload" as="video" href="/lottie/SearchAnimation.mp4" type="video/mp4" />
      </head>
      <body className={`${inter.className} ${geistMono.variable} antialiased`} suppressHydrationWarning>
        <QueryProvider>
          <SplashScreen />
          {children}
          <Toaster />
        </QueryProvider>
      </body>
    </html>
  );
}
