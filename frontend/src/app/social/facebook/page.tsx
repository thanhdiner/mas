"use client";

import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Plus, Globe, Activity, MessageCircle, BarChart3, Settings } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function FacebookManagementPage() {
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
            <div className="text-2xl font-bold">1</div>
            <p className="text-xs text-on-surface-dim mt-1">Ready for publishing</p>
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
              <div className="flex items-center justify-between p-3 rounded-lg bg-surface-base border border-white/5 shadow-sm">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded bg-blue-600 flex items-center justify-center text-white font-bold">
                    F
                  </div>
                  <div>
                    <p className="text-sm font-medium text-foreground">Fanpage Demo</p>
                    <p className="text-[10px] text-green-400">Connected</p>
                  </div>
                </div>
                <Button variant="ghost" size="icon" className="h-8 w-8 text-on-surface-dim hover:text-white">
                  <Settings className="w-4 h-4" />
                </Button>
              </div>
              
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
