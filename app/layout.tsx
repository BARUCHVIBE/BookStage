import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { headers } from "next/headers";
import "./globals.css";

const inter = Inter({ variable: "--font-inter", subsets: ["latin"] });
export async function generateMetadata(): Promise<Metadata> {
  const h = await headers(),
    host = h.get("host") ?? "localhost:3000",
    protocol =
      h.get("x-forwarded-proto") ??
      (host.startsWith("localhost") ? "http" : "https"),
    image = `${protocol}://${host}/og.png`;
  return {
    title: "BookStage",
    description: "Todo o modelo operacional de shows em um só lugar.",
    icons: { icon: "/favicon.svg", shortcut: "/favicon.svg" },
    openGraph: {
      title: "BookStage",
      description: "Todo o modelo operacional de shows em um só lugar.",
      images: [image],
    },
    twitter: {
      card: "summary_large_image",
      title: "BookStage",
      description: "Todo o modelo operacional de shows em um só lugar.",
      images: [image],
    },
  };
}
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <body className={`${inter.variable} antialiased`}>{children}</body>
    </html>
  );
}
