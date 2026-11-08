import type { Metadata } from "next";
import "./globals.css";
import { Manrope } from "next/font/google";
import { cn } from "@/lib/utils";

const manrope = Manrope({
  subsets: ["latin"],
  variable: "--font-sans",
  weight: ["400", "500", "600", "700", "800"],
});

export const metadata: Metadata = {
  title: "Kinesis — Voyagez au Togo",
  description:
    "Recherchez et réservez vos voyages en bus entre les villes du Togo avec Kinesis.",
  icons: { icon: "/kinesis-mark.png" },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="fr" className={cn("font-sans", manrope.variable)}>
      <body>{children}</body>
    </html>
  );
}
