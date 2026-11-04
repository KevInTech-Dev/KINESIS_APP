import type { Metadata } from "next";
import "./globals.css";
import { Geist } from "next/font/google";
import { cn } from "@/lib/utils";

const geist = Geist({subsets:['latin'],variable:'--font-sans'});

export const metadata: Metadata = {
  title: "Kinesis — Voyagez au Togo",
  description:
    "Recherchez et réservez vos voyages en bus entre les villes du Togo avec Kinesis.",
  icons: { icon: "/kinesis-mark.png" },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="fr" className={cn("font-sans", geist.variable)}>
      <body>{children}</body>
    </html>
  );
}
