import type { Metadata, Viewport } from "next";
import { Andika, Grandstander } from "next/font/google";
import "./globals.css";

// next/font downloads both faces at build time and serves them from this app,
// so the type still renders with Wi-Fi off.
const grandstander = Grandstander({
  variable: "--font-grandstander",
  subsets: ["latin"],
  weight: "variable",
});

// Andika was made for children learning to read: single-storey a and g,
// clear letter shapes that do not mirror each other.
const andika = Andika({
  variable: "--font-andika",
  subsets: ["latin"],
  weight: ["400", "700"],
});

export const metadata: Metadata = {
  title: "Guhit",
  description:
    "Your child's drawing comes alive and talks back, and nothing ever leaves the device.",
  applicationName: "Guhit",
  appleWebApp: { capable: true, title: "Guhit", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  themeColor: "#fff8ec",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${grandstander.variable} ${andika.variable} h-full antialiased`}>
      <body className="min-h-dvh flex flex-col">
        {/* Shared filter for .crayon-edge outlines; defined once, used everywhere. */}
        <svg aria-hidden="true" width="0" height="0" className="absolute">
          <filter id="crayon-edge" x="-5%" y="-5%" width="110%" height="110%">
            <feTurbulence type="fractalNoise" baseFrequency="0.035" numOctaves="2" seed="7" />
            <feDisplacementMap in="SourceGraphic" scale="3.5" />
          </filter>
        </svg>
        {children}
      </body>
    </html>
  );
}
