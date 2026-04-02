"use client";

import { usePathname } from "next/navigation";
import { useState, useEffect } from "react";
import { Sidebar } from "@/components/sidebar";

export function AppLayoutWrapper({ 
  children,
  defaultCollapsed = false,
}: { 
  children: React.ReactNode;
  defaultCollapsed?: boolean;
}) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(defaultCollapsed);

  const setCollapsedWithStorage = (val: boolean) => {
    setCollapsed(val);
    document.cookie = `sidebar_collapsed=${val}; path=/; max-age=31536000`;
    localStorage.setItem("sidebar_collapsed", String(val));
  };
  
  const isAuthPage = pathname === "/login" || pathname === "/register";

  if (isAuthPage) {
    return <main className="w-full">{children}</main>;
  }

  const isCanvasPage = pathname === "/agents/canvas";

  return (
    <>
      <Sidebar collapsed={collapsed} setCollapsed={setCollapsedWithStorage} />
      <main className={`flex-1 transition-all duration-300 ${collapsed ? "ml-[72px]" : "ml-[72px] lg:ml-[260px]"}`}>
        <div className={isCanvasPage ? "p-4 w-full" : "p-6 lg:p-8 max-w-[1600px] mx-auto"}>{children}</div>
      </main>
    </>
  );
}
