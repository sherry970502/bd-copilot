import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "BD Copilot · AI 商务拓展团队",
  description: "说出你想跟谁合作，AI 专员团队带你从背调走到签约",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body className="min-h-screen flex flex-col antialiased">{children}</body>
    </html>
  );
}
