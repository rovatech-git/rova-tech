import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = { title: "Rova Tech — Jardim 3D", description: "Explore o jardim 3D da Rova Tech com um gato branco curioso. Pule, corra e encontre 12 peixinhos no seu próprio ritmo.", icons: { icon: "/favicon.svg", shortcut: "/favicon.svg" } };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) { return <html lang="pt-BR"><body>{children}</body></html>; }
