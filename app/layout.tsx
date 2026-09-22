import type { Metadata } from "next";
import { Cormorant_Garamond, Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";

const cormorant = Cormorant_Garamond({
  variable: "--font-cormorant",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
  weight: ["400", "500"],
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL(
    process.env.BETTER_AUTH_URL ||
      process.env.NEXT_PUBLIC_APP_URL ||
      "http://localhost:3000",
  ),
  title: {
    default: "S3-Split — S3 Gateway & Storage Quotas",
    template: "%s | S3-Split",
  },
  description:
    "Multi-tenant platform that partitions S3-compatible storage into managed buckets with strictly enforced storage quotas using an S3 gateway proxy.",
  keywords: [
    "S3",
    "storage quota",
    "S3 gateway",
    "object storage",
    "SigV4",
    "managed buckets",
    "multi-tenant",
  ],
  openGraph: {
    title: "S3-Split — S3 Gateway & Storage Quotas",
    description:
      "Multi-tenant platform that partitions S3-compatible storage into managed buckets with strictly enforced storage quotas using an S3 gateway proxy.",
    type: "website",
    siteName: "S3-Split",
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: "S3-Split — S3 Gateway & Storage Quotas",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "S3-Split — S3 Gateway & Storage Quotas",
    description:
      "Multi-tenant platform that partitions S3-compatible storage into managed buckets with strictly enforced storage quotas using an S3 gateway proxy.",
    images: ["/og-image.png"],
  },
  robots: {
    index: true,
    follow: true,
  },
  icons: {
    icon: [
      { url: "/icon.svg", type: "image/svg+xml" },
      { url: "/favicon.ico" },
    ],
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      className={`${cormorant.variable} ${inter.variable} ${jetbrainsMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-[#faf9f5] text-[#141413] font-sans">
        {children}
      </body>
    </html>
  );
}
