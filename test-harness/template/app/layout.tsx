import "./globals.css";
import { Providers } from "@/components/providers";
import { ThemeScript } from "@/components/theme-script";

export const metadata = { title: "Dashboard plugin harness" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-brand="togo" suppressHydrationWarning>
      <head>
        <ThemeScript />
      </head>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
