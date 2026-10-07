"use client";

import type { ReactNode } from "react";
import { NasaqProvider, Toaster } from "@fadymondy/nasaq/web";

// NasaqProvider applies the ToGO brand (data-brand="togo"), the light/dark theme
// (persisted, applied before paint by the script in app/layout.tsx), and the EN/AR
// locale with its direction on <html>. Toaster is mounted once, here.
// @fadymondy/nasaq/web is client-only: import it from "use client" files.
export function Providers({ children }: { children: ReactNode }) {
  return (
    <NasaqProvider brand="togo" defaultTheme="dark">
      {children}
      <Toaster />
    </NasaqProvider>
  );
}
