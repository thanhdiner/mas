"use client";

import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { MessageCircle, Wrench, Plug } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

export default function ZaloManagementPage() {
  return (
    <>
      <PageHeader 
        title="Zalo Management" 
        description="Integrate Zalo ZNS and manage your Zalo Official Accounts"
      />
      
      <div className="h-[60vh] flex items-center justify-center">
        <Card className="w-full max-w-md bg-surface-high border-white/5 text-center p-8">
          <CardContent className="pt-6">
            <div className="mx-auto w-20 h-20 bg-[rgba(0,144,255,0.1)] rounded-full flex items-center justify-center mb-6">
              <MessageCircle className="w-10 h-10 text-[#0090ff]" />
            </div>
            <h2 className="text-xl font-semibold mb-2">In Development</h2>
            <p className="text-sm text-on-surface-dim mb-8">
              The API integration module for Zalo (Zalo OA & ZNS) is currently under construction. This infrastructure will be deployed in an upcoming version.
            </p>
            <div className="flex flex-col gap-3">
              <Button disabled className="bg-surface-container text-on-surface-dim opacity-50 border-0 flex items-center justify-center gap-2">
                <Plug className="w-4 h-4" />
                Connect Zalo OA (Coming Soon)
              </Button>
              <Button variant="ghost" className="text-accent-cyan hover:bg-surface-container hover:text-accent-cyan flex justify-center items-center gap-2">
                <Wrench className="w-4 h-4" />
                View System Roadmap
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
