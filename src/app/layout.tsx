import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";
import QueryProvider from "@/components/QueryProvider";
import SplashScreen from "@/components/SplashScreen";
import PageRevealTransition from "@/components/PageRevealTransition";

const inter = Inter({ subsets: ["latin"] });

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
      <body className={`${inter.className} antialiased`} suppressHydrationWarning>
        <QueryProvider>
          <SplashScreen />
          <PageRevealTransition>
            {children}
          </PageRevealTransition>
          <Toaster />
        </QueryProvider>
      </body>
    </html>
  );
}
