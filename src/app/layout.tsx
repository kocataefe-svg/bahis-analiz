import type { Metadata, Viewport } from "next";
import { Oswald, Hanken_Grotesk } from "next/font/google";
import { CouponProvider } from "@/lib/coupon-context";
import { UserIdentityProvider } from "@/lib/user-identity";
import { AppShell } from "./app-shell";
import "./globals.css";

const oswald = Oswald({
  variable: "--font-display",
  subsets: ["latin"],
  weight: ["500", "600", "700"],
});

const hankenGrotesk = Hanken_Grotesk({
  variable: "--font-body",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Bahis Analiz",
  description: "Futbol maclari icin referans oran ve AI destekli analiz - gercek para icermez.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#0d1512",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="tr" className={`${oswald.variable} ${hankenGrotesk.variable}`}>
      <body>
        <UserIdentityProvider>
          <CouponProvider>
            <AppShell>{children}</AppShell>
          </CouponProvider>
        </UserIdentityProvider>
      </body>
    </html>
  );
}
