import type { Metadata } from "next";
import { Geist, Geist_Mono, Instrument_Serif } from "next/font/google";
import { headers } from "next/headers";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });
const instrumentSerif = Instrument_Serif({ variable: "--font-instrument-serif", subsets: ["latin"], weight: "400" });

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host") ?? "localhost:3000";
  const protocol = requestHeaders.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  const base = new URL(`${protocol}://${host}`);
  const title = "Continuity Lab — A new paradigm in game development and continuity";
  const description = "Add project material or a public repository, ask what is true or what must happen next, and trace the cited dependencies behind the answer.";
  const socialImage = new URL("/og.png", base).toString();

  return {
    metadataBase: base,
    title,
    description,
    icons: { icon: "/continuity-lab-plugin-icon.png", shortcut: "/continuity-lab-plugin-icon.png", apple: "/continuity-lab-plugin-icon.png" },
    openGraph: { title, description, type: "website", url: base, images: [{ url: socialImage, width: 1672, height: 941, alt: "Continuity Lab game development and continuity analysis" }] },
    twitter: { card: "summary_large_image", title, description, images: [socialImage] },
  };
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body className={`${geistSans.variable} ${geistMono.variable} ${instrumentSerif.variable}`}>{children}</body></html>;
}
