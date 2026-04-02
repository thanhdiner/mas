"use client";

import { usePathname } from "next/navigation";
import { useState, useEffect } from "react";
import { Sidebar } from "@/components/sidebar";

export function AppLayoutWrapper({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem("sidebar_collapsed");
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (stored !== null) setCollapsed(stored === "true");
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setIsLoaded(true);
  }, []);

  const setCollapsedWithStorage = (val: boolean) => {
    setCollapsed(val);
    localStorage.setItem("sidebar_collapsed", String(val));
  };
  
  const isAuthPage = pathname === "/login" || pathname === "/register";

  if (isAuthPage) {
    return <main className="w-full">{children}</main>;
  }

  const isCanvasPage = pathname === "/agents/canvas";

  return (
    <>
      <Sidebar collapsed={collapsed} setCollapsed={setCollapsedWithStorage} isLoaded={isLoaded} />
      <main className={`flex-1 transition-all duration-300 ${!isLoaded ? "ml-[72px] lg:ml-[260px]" : (collapsed ? "ml-[72px]" : "ml-[72px] lg:ml-[260px]")}`}>
        <div className={isCanvasPage ? "p-4 w-full" : "p-6 lg:p-8 max-w-[1600px] mx-auto"}>{children}</div>
      </main>
    </>
  );
}
