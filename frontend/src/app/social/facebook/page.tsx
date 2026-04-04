"use client";

import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Plus, Globe, Activity, MessageCircle, BarChart3, Settings, Loader2 } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useFacebookPages } from "@/lib/hooks/use-facebook";
import type { FacebookPage } from "@/lib/api";

const PAGE_FETCH_LIMIT = 50;

function getTokenStatusMeta(status: FacebookPage["tokenStatus"]) {
  switch (status) {
    case "active":
      return {
        label: "Active token",
        className: "text-green-400",
      };
    case "expired":
      return {
        label: "Expired token",
        className: "text-amber-400",
      };
    case "revoked":
      return {
        label: "Revoked token",
        className: "text-red-400",
      };
    default:
      return {
        label: "Unknown status",
        className: "text-on-surface-dim",
      };
  }
}

export default function FacebookManagementPage() {
  const { pages, total, error, isLoading } = useFacebookPages(0, PAGE_FETCH_LIMIT);

  return (
    <>
      <PageHeader 
        title="Facebook Management" 
        description="Post, schedule, and manage your network of Facebook Fanpages"
        actions={
          <Button className="gradient-primary text-[#060e20] border-0 hover:opacity-90 font-medium">
            <Plus className="w-4 h-4 mr-2" />
            Create New Post
          </Button>
        }
      />
      
      {/* Quick Stats Grid */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4 mb-6">
        <Card className="bg-surface-high border-white/5">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-foreground">Connected Pages</CardTitle>
            <Globe className="w-4 h-4 text-blue-400" />
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-2">
                <div className="h-8 w-12 rounded bg-surface-container animate-pulse" />
                <div className="h-3 w-32 rounded bg-surface-container/80 animate-pulse" />
              </div>
            ) : (
              <>
                <div className="text-2xl font-bold">{error ? "--" : total}</div>
                <p className="text-xs text-on-surface-dim mt-1">
                  {error ? "Unable to sync pages" : total > 0 ? "Ready for publishing" : "No pages connected yet"}
                </p>
              </>
            )}
          </CardContent>
        </Card>
        <Card className="bg-surface-high border-white/5">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-foreground">Today's Posts</CardTitle>
            <Activity className="w-4 h-4 text-green-400" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">0</div>
            <p className="text-xs text-on-surface-dim mt-1">Scheduled in queue</p>
          </CardContent>
        </Card>
        <Card className="bg-surface-high border-white/5">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-foreground">Total Engagement</CardTitle>
            <BarChart3 className="w-4 h-4 text-purple-400" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">--</div>
            <p className="text-xs text-on-surface-dim mt-1">No data available yet</p>
          </CardContent>
        </Card>
        <Card className="bg-surface-high border-white/5">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-foreground">New Messages</CardTitle>
            <MessageCircle className="w-4 h-4 text-pink-400" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">0</div>
            <p className="text-xs text-on-surface-dim mt-1">Inbox is empty</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_300px]">
        {/* Main Content Area */}
        <div className="space-y-6">
          <Card className="bg-surface-base border-white/5 overflow-hidden">
            <CardHeader className="bg-surface-lowest/50 border-b border-white/5">
              <CardTitle className="flex items-center gap-2 text-lg">
                <Activity className="w-5 h-5 text-accent-cyan" />
                Content Timeline
              </CardTitle>
              <CardDescription>Recent posts and upcoming scheduled content</CardDescription>
            </CardHeader>
            <CardContent className="p-12 text-center flex flex-col items-center">
              <div className="w-16 h-16 rounded-full bg-surface-container flex items-center justify-center mb-4">
                <Globe className="w-8 h-8 text-on-surface-dim opacity-50" />
              </div>
              <h3 className="text-lg font-medium text-foreground mb-2">No posts available</h3>
              <p className="text-sm text-on-surface-dim mb-6 max-w-[300px]">
                Create your first content draft or connect the Agent subsystem to completely automate your social pipelines.
              </p>
              <Button variant="secondary" className="bg-surface-high border-0 text-accent-cyan hover:bg-surface-highest">
                <Plus className="w-4 h-4 mr-2" /> Launch First Post
              </Button>
            </CardContent>
          </Card>
        </div>

        {/* Sidebar settings Area */}
        <div className="space-y-6">
          <Card className="bg-surface-high border-white/5">
            <CardHeader>
              <CardTitle className="text-sm">Your Pages</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {isLoading ? (
                <>
                  {Array.from({ length: 3 }).map((_, index) => (
                    <div
                      key={index}
                      className="flex items-center justify-between p-3 rounded-lg bg-surface-base border border-white/5 shadow-sm animate-pulse"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded bg-surface-container" />
                        <div className="space-y-2">
                          <div className="h-3.5 w-24 rounded bg-surface-container" />
                          <div className="h-2.5 w-16 rounded bg-surface-container/80" />
                        </div>
                      </div>
                      <div className="w-8 h-8 rounded bg-surface-container" />
                    </div>
                  ))}
                  <div className="flex items-center justify-center gap-2 pt-1 text-sm text-on-surface-dim">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Loading pages...
                  </div>
                </>
              ) : error ? (
                <div className="rounded-lg border border-dashed border-white/10 bg-surface-base p-5 text-center">
                  <div className="w-10 h-10 rounded-full bg-surface-container flex items-center justify-center mx-auto mb-3">
                    <Globe className="w-5 h-5 text-on-surface-dim opacity-60" />
                  </div>
                  <p className="text-sm font-medium text-foreground">Unable to load pages</p>
                  <p className="text-xs text-on-surface-dim mt-1">
                    Check the API connection and try again from the fanpages screen.
                  </p>
                </div>
              ) : pages.length === 0 ? (
                <div className="rounded-lg border border-dashed border-white/10 bg-surface-base p-5 text-center">
                  <div className="w-10 h-10 rounded-full bg-surface-container flex items-center justify-center mx-auto mb-3">
                    <Globe className="w-5 h-5 text-on-surface-dim opacity-60" />
                  </div>
                  <p className="text-sm font-medium text-foreground">No pages connected</p>
                  <p className="text-xs text-on-surface-dim mt-1">
                    Connect your first Facebook Page to start publishing.
                  </p>
                </div>
              ) : (
                <div className="space-y-3 max-h-[420px] overflow-y-auto pr-1">
                  {pages.map((page) => {
                    const status = getTokenStatusMeta(page.tokenStatus);

                    return (
                      <div key={page.id} className="flex items-center justify-between p-3 rounded-lg bg-surface-base border border-white/5 shadow-sm">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className={`w-8 h-8 rounded overflow-hidden flex items-center justify-center text-white font-bold shrink-0 ${page.avatarColor || "bg-blue-600"}`}>
                            {page.avatarUrl ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={page.avatarUrl} alt={page.name} className="w-full h-full object-cover" />
                            ) : (
                              page.name.charAt(0).toUpperCase()
                            )}
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-foreground truncate">{page.name}</p>
                            <p className={`text-[10px] ${status.className}`}>{status.label}</p>
                          </div>
                        </div>
                        <Link
                          href="/social/facebook/pages"
                          className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-on-surface-dim transition-colors hover:bg-muted hover:text-white"
                        >
                          <Settings className="w-4 h-4" />
                        </Link>
                      </div>
                    );
                  })}
                </div>
              )}
              
              <Link href="/social/facebook/pages" className="w-full">
                <Button variant="outline" className="w-full mt-2 border-dashed border-white/10 text-on-surface-dim hover:border-white/20 hover:text-white hover:bg-surface-base bg-transparent">
                  <Plus className="w-4 h-4 mr-2" /> Manage All Fanpages
                </Button>
              </Link>
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}
