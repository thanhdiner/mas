"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Sidebar } from "@/components/sidebar";

export function AppLayoutWrapper({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [isClient, setIsClient] = useState(false);
  
  const isAuthPage = pathname === "/login" || pathname === "/register";

  useEffect(() => {
    setIsClient(true);
    const token = localStorage.getItem("mas_token");
    if (!token && !isAuthPage) {
      router.push("/login");
    }
  }, [pathname, isAuthPage, router]);

  // Avoid hydration mismatch by waiting for client mount
  if (!isClient) {
    return null;
  }

  if (isAuthPage) {
    return <main className="w-full">{children}</main>;
  }

  return (
    <>
      <Sidebar />
      <main className="flex-1 ml-[72px] lg:ml-[260px] transition-all duration-300">
        <div className="p-6 lg:p-8 max-w-[1600px] mx-auto">{children}</div>
      </main>
    </>
  );
}
