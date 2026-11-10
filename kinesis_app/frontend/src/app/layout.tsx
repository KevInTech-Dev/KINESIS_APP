import type { Metadata, Viewport } from "next";
import { Suspense } from "react";
import "./globals.css";
import { Manrope } from "next/font/google";
import { cn } from "@/lib/utils";
import { Toaster } from "@/components/ui/sonner";
import MobileAppNav from "@/components/mobile-app-nav";
import { ServiceWorkerRegistration } from "./service-worker-registration";

const manrope = Manrope({
  subsets: ["latin"],
  variable: "--font-sans",
  weight: ["400", "500", "600", "700", "800"],
});

export const metadata: Metadata = {
  title: "Kinesis — Voyagez au Togo",
  description:
    "Recherchez et réservez vos voyages en bus entre les villes du Togo avec Kinesis.",
  applicationName: "Kinesis",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Kinesis"
  },
  icons: {
    icon: [
      {
        url: "/icons/icon-192.png",
        sizes: "192x192",
        type: "image/png"
      },
      {
        url: "/icons/icon-512.png",
        sizes: "512x512",
        type: "image/png"
      }
    ],
    apple: "/icons/apple-touch-icon.png"
  }
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#063e2e"
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="fr" className={cn("font-sans", manrope.variable)}>
      <body>
        <ServiceWorkerRegistration />
        {children}
        <Suspense fallback={null}>
          <MobileAppNav />
        </Suspense>
        <Toaster />
      </body>
    </html>
  );
}
