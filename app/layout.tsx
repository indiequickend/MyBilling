import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono, Instrument_Sans, IBM_Plex_Mono } from "next/font/google";
import { ThemeProvider } from "next-themes";
import NextTopLoader from "nextjs-toploader";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ServiceWorkerRegister } from "@/components/pwa/ServiceWorkerRegister";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const instrumentSans = Instrument_Sans({
  variable: "--font-instrument-sans",
  subsets: ["latin"],
});

// Tabular figures for money/GSTIN/document-number columns — ledger-style
// column alignment is a functional requirement, not decoration.
const ibmPlexMono = IBM_Plex_Mono({
  variable: "--font-plex-mono",
  weight: ["400", "500"],
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "MyBilling",
  description: "Self-hosted billing, invoicing, and inventory platform",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "MyBilling",
  },
};

// Static per-color-scheme theme-color; does not track a manual next-themes
// toggle inside an already-installed PWA (OS chrome color may lag one paint
// behind in that specific case) — acceptable, cosmetic-only limitation.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#EFF1F0" },
    { media: "(prefers-color-scheme: dark)", color: "#14181C" },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} ${instrumentSans.variable} ${ibmPlexMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="flex min-h-full flex-col">
        <ThemeProvider attribute="class" defaultTheme="light" enableSystem>
          <NextTopLoader color="var(--primary)" height={3} showSpinner={false} shadow={false} />
          <TooltipProvider delayDuration={200}>{children}</TooltipProvider>
          <ServiceWorkerRegister />
        </ThemeProvider>
      </body>
    </html>
  );
}
