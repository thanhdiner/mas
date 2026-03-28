"use client";

import { usePathname } from "next/navigation";
import { Sidebar } from "@/components/sidebar";

export function AppLayoutWrapper({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  
  const isAuthPage = pathname === "/login" || pathname === "/register";

  // Auth pages get a clean layout without sidebar
  if (isAuthPage) {
    return <main className="w-full">{children}</main>;
  }

  // Authenticated pages get the sidebar layout.
  // Route protection is handled by Next.js middleware (src/middleware.ts),
  // so no client-side token check is needed here.
  return (
    <>
      <Sidebar />
      <main className="flex-1 ml-[72px] lg:ml-[260px] transition-all duration-300">
        <div className="p-6 lg:p-8 max-w-[1600px] mx-auto">{children}</div>
      </main>
    </>
  );
}
