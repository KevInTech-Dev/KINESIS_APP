import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Kinesis — Voyagez au Togo",
  description:
    "Recherchez et réservez vos voyages en bus entre les villes du Togo avec Kinesis.",
  icons: { icon: "/kinesis-mark.png" },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="fr">
      <body>{children}</body>
    </html>
  );
}
