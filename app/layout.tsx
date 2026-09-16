import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({ variable: "--font-inter", subsets: ["latin"] });
export const metadata: Metadata = {
    title: "BookBusiness",
    description: "Todo o modelo operacional de shows em um só lugar.",
    icons: {
      icon: [
        {
          url: "/brand/book_business_app_icon_light.svg",
          media: "(prefers-color-scheme: light)",
        },
        {
          url: "/brand/book_business_app_icon_dark.svg",
          media: "(prefers-color-scheme: dark)",
        },
      ],
      shortcut: "/brand/book_business_app_icon_light.svg",
    },
    openGraph: {
      title: "BookBusiness",
      description: "Todo o modelo operacional de shows em um só lugar.",
      images: [
        {
          url: "/og-bookbusiness.png",
          width: 1200,
          height: 630,
          alt: "BookBusiness — gestão comercial e operacional de shows",
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title: "BookBusiness",
      description: "Todo o modelo operacional de shows em um só lugar.",
      images: ["/og-bookbusiness.png"],
    },
  };
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <body className={`${inter.variable} antialiased`}>{children}</body>
    </html>
  );
}
