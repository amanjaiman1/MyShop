import type { Metadata, Viewport } from "next";
import { Inter, JetBrains_Mono, Playfair_Display } from "next/font/google";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/misc";
import { OnlineProvider } from "@/components/providers/online-provider";
import { ServiceWorkerRegistrar } from "@/components/pwa/service-worker-registrar";
import "./globals.css";

/**
 * Typography: an editorial serif for display headings, a highly legible sans for
 * every form and figure, and a mono for machine codes (COS-000120, invoices).
 * `display: "swap"` keeps first paint fast on a mid-range Android phone.
 */
const playfair = Playfair_Display({
  subsets: ["latin"],
  variable: "--font-playfair",
  display: "swap",
  weight: ["400", "500", "600", "700"],
});

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

const mono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono-code",
  display: "swap",
  weight: ["400", "500"],
});

export const metadata: Metadata = {
  title: {
    default: "Aurelia — Beauty inventory, priced right",
    template: "%s · Aurelia",
  },
  description:
    "Inventory, purchase costs, FIFO profit and daily P&L for a cosmetics resale shop. Know your margin before you sell.",
  applicationName: "Aurelia",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "Aurelia",
    statusBarStyle: "default",
  },
  formatDetection: { telephone: false },
  icons: {
    icon: [
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180" }],
  },
  // A private ledger has no business being indexed.
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  themeColor: "#FBF7F4",
  colorScheme: "light",
  // Let the app paint into the notch area on Android/iOS when installed.
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${inter.variable} ${playfair.variable} ${mono.variable}`}>
      <body className="antialiased">
        <OnlineProvider>
          <TooltipProvider delayDuration={250}>{children}</TooltipProvider>
        </OnlineProvider>
        <Toaster />
        <ServiceWorkerRegistrar />
      </body>
    </html>
  );
}
