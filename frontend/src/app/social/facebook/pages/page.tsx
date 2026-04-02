"use client";

import { useState } from "react";
import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { 
  Plus, 
  Globe, 
  Settings, 
  Trash2, 
  RefreshCw, 
  Search, 
  ShieldAlert,
  ShieldCheck,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Plug,
  Copy,
  Eye,
  EyeOff,
  ExternalLink,
  Calendar,
  User
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
  DialogHeader,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { useFacebookPages } from "@/lib/hooks/use-facebook";
import { api } from "@/lib/api";
import type { FacebookPage } from "@/lib/api";

function formatFollowers(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function timeAgo(dateStr: string | null): string {
  if (!dateStr) return "Never";
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

const AVATAR_COLORS = [
  "bg-blue-600", "bg-orange-500", "bg-purple-600", "bg-green-500",
  "bg-pink-500", "bg-cyan-500", "bg-red-500", "bg-indigo-500",
];

const PAGE_SIZE = 10;

export default function FanpagesManagementPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const currentPage = Math.max(1, Number(searchParams.get("page")) || 1);
  const skip = (currentPage - 1) * PAGE_SIZE;
  const { pages, total, isLoading, mutate } = useFacebookPages(skip, PAGE_SIZE);
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const setCurrentPage = (page: number) => {
    const params = new URLSearchParams(searchParams.toString());
    if (page <= 1) {
      params.delete("page");
    } else {
      params.set("page", String(page));
    }
    router.push(`?${params.toString()}`, { scroll: false });
  };
  const [searchQuery, setSearchQuery] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<FacebookPage | null>(null);
  const [settingsTarget, setSettingsTarget] = useState<FacebookPage | null>(null);
  const [seeding, setSeeding] = useState(false);
  const [settingsTokenVisible, setSettingsTokenVisible] = useState(false);
  const [settingsNewToken, setSettingsNewToken] = useState("");
  const [settingsSaving, setSettingsSaving] = useState(false);
  
  // Tab State
  const [activeTab, setActiveTab] = useState("auto");

  // Form states
  const [formPageId, setFormPageId] = useState("");
  const [formToken, setFormToken] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [authUrlLoading, setAuthUrlLoading] = useState(false);

  const filtered = pages.filter(
    (p) =>
      p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.pageId.includes(searchQuery)
  );

  const handleManualCreate = async () => {
    if (!formPageId.trim() || !formToken.trim()) {
      toast.error("Page ID and Access Token are required.");
      return;
    }
    setSubmitting(true);
    try {
      await api.social.facebook.createManualPage(formPageId.trim(), formToken.trim());
      toast.success(`Fanpage added successfully!`);
      setAddOpen(false);
      setFormPageId("");
      setFormToken("");
      mutate();
    } catch {
      toast.error("Failed to connect Fanpage. Invalid ID or Token.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleAutoConnect = async () => {
    setAuthUrlLoading(true);
    try {
      const res = await api.social.facebook.getAuthUrl();
      if (res.url) {
        window.location.href = res.url;
      }
    } catch {
      toast.error("Failed to generate OAuth URL. Check your Backend Facebook Settings.");
    } finally {
      setAuthUrlLoading(false);
    }
  };

  const handleDelete = async (page: FacebookPage) => {
    try {
      await api.social.facebook.deletePage(page.id);
      toast.success(`"${page.name}" removed successfully.`);
      setDeleteTarget(null);
      mutate();
    } catch {
      toast.error("Failed to remove Fanpage.");
    }
  };

  const handleSeed = async () => {
    setSeeding(true);
    try {
      const res = await api.social.facebook.seedPages();
      if (res.inserted > 0) {
        toast.success(`Seeded ${res.inserted} sample fanpages.`);
      } else {
        toast.info(res.message);
      }
      mutate();
    } catch {
      toast.error("Failed to seed data.");
    } finally {
      setSeeding(false);
    }
  };

  const handleSettingsOpen = (page: FacebookPage) => {
    setSettingsTarget(page);
    setSettingsTokenVisible(false);
    setSettingsNewToken("");
  };

  const handleUpdateToken = async () => {
    if (!settingsTarget || !settingsNewToken.trim()) return;
    setSettingsSaving(true);
    try {
      let token = settingsNewToken.trim();
      if (token.toLowerCase().startsWith("bearer ")) {
        token = token.slice(7).trim();
      }
      await api.social.facebook.createManualPage(settingsTarget.pageId, token);
      toast.success("Access token updated & validated successfully!");
      setSettingsTarget(null);
      setSettingsNewToken("");
      mutate();
    } catch {
      toast.error("Invalid token. Facebook rejected it.");
    } finally {
      setSettingsSaving(false);
    }
  };

  return (
    <>
      {/* Navigation Breadcrumb */}
      <div className="mb-4">
        <Link 
          href="/social/facebook" 
          className="inline-flex items-center text-sm font-medium text-on-surface-dim hover:text-white transition-colors"
        >
          <ChevronLeft className="w-4 h-4 mr-1" />
          Back to Facebook Dashboard
        </Link>
      </div>

      <PageHeader 
        title="Bulk Fanpages Management" 
        description="Add, remove, and monitor the API tokens for all your integrated social channels"
        actions={
          <Button 
            className="gradient-primary text-[#060e20] border-0 hover:opacity-90 font-medium"
            onClick={() => setAddOpen(true)}
          >
            <Plus className="w-4 h-4 mr-2" />
            Add New Fanpage
          </Button>
        }
      />

      {/* Add Fanpage Dialog */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="bg-surface-high border-white/10 text-foreground max-w-lg">
          <DialogHeader>
            <DialogTitle>Connect Facebook Pages</DialogTitle>
            <DialogDescription className="text-on-surface-dim">
              Choose how you want to import your pages.
            </DialogDescription>
          </DialogHeader>

          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full mt-2">
            <TabsList className="grid w-full grid-cols-2 bg-surface-base border border-white/5">
              <TabsTrigger value="auto">Auto Connect (OAuth)</TabsTrigger>
              <TabsTrigger value="manual">Manual Token</TabsTrigger>
            </TabsList>

            <TabsContent value="auto" className="py-6 flex flex-col items-center justify-center text-center space-y-6">
              <div className="w-16 h-16 bg-[#1877F2]/10 rounded-full flex items-center justify-center">
                <Plug className="w-8 h-8 text-[#1877F2]" />
              </div>
              <div className="space-y-2 max-w-sm">
                <h3 className="font-medium text-foreground">Log in with Facebook</h3>
                <p className="text-sm text-on-surface-dim">
                  Automatically fetch all Fanpages you manage in 1-click. Requires a Facebook Developer App integration.
                </p>
              </div>
              <Button 
                onClick={handleAutoConnect} 
                disabled={authUrlLoading}
                className="bg-[#1877F2] hover:bg-[#1877F2]/90 text-white w-full sm:w-auto"
              >
                {authUrlLoading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Plug className="w-4 h-4 mr-2" />}
                Continue with Facebook
              </Button>
            </TabsContent>

            <TabsContent value="manual" className="space-y-4 py-4">
              {/* Hidden honeypot fields to prevent Chrome from autofilling the search bar */}
              <div aria-hidden="true" style={{ position: 'absolute', opacity: 0, height: 0, overflow: 'hidden', pointerEvents: 'none' }}>
                <input type="text" name="fake_username_field" tabIndex={-1} autoComplete="username" />
                <input type="password" name="fake_password_field" tabIndex={-1} autoComplete="current-password" />
              </div>
              <div className="bg-surface-base/50 p-4 rounded-md border border-white/5 text-sm text-on-surface-dim mb-2">
                Use this method to quickly connect a single page without setting up OAuth. Generate a Long-Lived Page Access Token from the Graph API Explorer.
              </div>
              <div className="space-y-2">
                <Label>Facebook Page ID *</Label>
                <Input 
                  placeholder="e.g. 109283746192837" 
                  value={formPageId} 
                  onChange={(e) => setFormPageId(e.target.value)}
                  className="bg-surface-base border-white/10"
                  autoComplete="off"
                />
              </div>
              <div className="space-y-2">
                <Label>Page Access Token (Long-Lived) *</Label>
                <Input 
                  type="password"
                  placeholder="EAA..." 
                  value={formToken} 
                  onChange={(e) => setFormToken(e.target.value)}
                  className="bg-surface-base border-white/10"
                  autoComplete="new-password"
                />
              </div>
              <div className="flex justify-end pt-4 gap-2">
                <Button variant="ghost" onClick={() => setAddOpen(false)} className="text-on-surface-dim">
                  Cancel
                </Button>
                <Button 
                  onClick={handleManualCreate} 
                  disabled={submitting || !formPageId.trim() || !formToken.trim()}
                  className="gradient-primary text-[#060e20] border-0"
                >
                  {submitting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                  Connect Fanpage
                </Button>
              </div>
            </TabsContent>
          </Tabs>
        </DialogContent>
      </Dialog>
      
      {/* Top action bar */}
      <div className="flex flex-col sm:flex-row gap-4 items-center justify-between mb-6">
        <div className="relative w-full max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-on-surface-dim" />
          <Input 
            name="search_fanpages_random_string"
            placeholder="Search Fanpages by Name or ID..." 
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9 bg-surface-base border-white/10 text-foreground w-full"
            autoComplete="new-password"
            spellCheck="false"
          />
        </div>
        
        <div className="flex items-center gap-3 w-full sm:w-auto">
          <Button 
            variant="outline" 
            className="border-dashed border-white/10 text-on-surface-dim hover:text-white hover:bg-surface-base bg-transparent"
            onClick={handleSeed}
            disabled={seeding}
          >
            {seeding ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-2" />}
            Seed Sample Data
          </Button>
        </div>
      </div>

      {/* Main Data Table */}
      <Card className="bg-surface-high border-white/5 overflow-hidden">
        <Table>
          <TableHeader className="bg-surface-base/50">
            <TableRow className="border-white/5 hover:bg-transparent">
              <TableHead className="text-on-surface-dim font-medium uppercase tracking-wider text-xs">Page Account</TableHead>
              <TableHead className="text-on-surface-dim font-medium uppercase tracking-wider text-xs">Category</TableHead>
              <TableHead className="text-on-surface-dim font-medium uppercase tracking-wider text-xs">Token Status</TableHead>
              <TableHead className="text-on-surface-dim font-medium uppercase tracking-wider text-xs">Last Activity</TableHead>
              <TableHead className="text-right text-on-surface-dim font-medium uppercase tracking-wider text-xs">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center p-12">
                  <Loader2 className="w-6 h-6 animate-spin mx-auto text-on-surface-dim" />
                  <p className="text-sm text-on-surface-dim mt-2">Loading Fanpages...</p>
                </TableCell>
              </TableRow>
            ) : filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center p-12">
                  <div className="w-14 h-14 rounded-full bg-surface-container flex items-center justify-center mx-auto mb-4">
                    <Globe className="w-7 h-7 text-on-surface-dim opacity-50" />
                  </div>
                  <h3 className="text-base font-medium text-foreground mb-1">No Fanpages Connected</h3>
                  <p className="text-sm text-on-surface-dim mb-4">
                    {searchQuery ? "No results match your search." : "Add your first Fanpage or seed sample data to get started."}
                  </p>
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((page) => (
                <TableRow key={page.id} className="border-white/5 hover:bg-surface-base/50 transition-colors">
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <div className={`w-10 h-10 rounded-lg flex items-center justify-center text-white font-bold shrink-0 overflow-hidden ${page.avatarColor}`}>
                        {page.avatarUrl ? (
                          <img src={page.avatarUrl} alt={page.name} className="w-full h-full object-cover" />
                        ) : (
                          page.name.charAt(0)
                        )}
                      </div>
                      <div>
                        <p className="text-sm font-medium text-foreground">{page.name}</p>
                        <p className="text-[11px] text-on-surface-dim font-mono">ID: {page.pageId}</p>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <span className="text-sm text-foreground">{page.category}</span>
                    <p className="text-[11px] text-on-surface-dim">{formatFollowers(page.followersCount)} followers</p>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-col items-start gap-1.5">
                      {page.tokenStatus === "active" ? (
                        <Badge variant="outline" className="bg-[rgba(78,222,163,0.1)] text-[#4edea3] border-0 inline-flex items-center gap-1.5 px-2 py-0.5">
                          <ShieldCheck className="w-3 h-3" />
                          Active
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="bg-[rgba(255,180,171,0.1)] text-[#ffb4ab] border-0 inline-flex items-center gap-1.5 px-2 py-0.5">
                          <ShieldAlert className="w-3 h-3" />
                          Expired Token
                        </Badge>
                      )}
                      {page.connectedAccountName && (
                        <div className="flex items-center gap-1 text-[11px] text-on-surface-dim mt-0.5">
                          {page.connectedAccountAvatar ? (
                            <img src={page.connectedAccountAvatar} alt={page.connectedAccountName} className="w-3.5 h-3.5 rounded-full" />
                          ) : (
                            <span className="w-3.5 h-3.5 rounded-full bg-surface-container flex items-center justify-center text-[8px] font-bold text-white">
                              {page.connectedAccountName.charAt(0)}
                            </span>
                          )}
                          <span className="truncate max-w-[100px]">{page.connectedAccountName}</span>
                        </div>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="text-sm text-on-surface-dim">
                    {timeAgo(page.lastPostedAt)}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      {page.tokenStatus === "expired" && (
                        <Button variant="ghost" size="sm" className="text-accent-cyan hover:text-accent-cyan hover:bg-surface-container">
                          Renew
                        </Button>
                      )}
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-on-surface-dim hover:text-white" title="Settings" onClick={() => handleSettingsOpen(page)}>
                        <Settings className="w-4 h-4" />
                      </Button>
                      <Button 
                        variant="ghost" 
                        size="icon" 
                        className="h-8 w-8 text-on-surface-dim hover:text-[#ffb4ab]" 
                        title="Remove Page"
                        onClick={() => setDeleteTarget(page)}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Card>

      {/* Delete Confirmation Dialog */}
      <Dialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <DialogContent className="bg-surface-high border-white/10 text-foreground">
          <DialogHeader>
            <DialogTitle>Remove Fanpage</DialogTitle>
            <DialogDescription className="text-on-surface-dim">
              Are you sure you want to remove <strong className="text-foreground">{deleteTarget?.name}</strong> from the management system? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDeleteTarget(null)} className="text-on-surface-dim">Cancel</Button>
            <Button variant="destructive" onClick={() => deleteTarget && handleDelete(deleteTarget)}>
              Remove
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Settings Dialog */}
      <Dialog open={!!settingsTarget} onOpenChange={(open) => { if (!open) { setSettingsTarget(null); setSettingsNewToken(""); setSettingsTokenVisible(false); } }}>
        <DialogContent className="bg-surface-high border-white/10 text-foreground sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-3">
              {settingsTarget?.avatarUrl ? (
                <img src={settingsTarget.avatarUrl} alt={settingsTarget.name} className="w-10 h-10 rounded-lg object-cover" />
              ) : (
                <div className={`w-10 h-10 rounded-lg flex items-center justify-center text-white font-bold ${settingsTarget?.avatarColor}`}>
                  {settingsTarget?.name.charAt(0)}
                </div>
              )}
              <div>
                <span>{settingsTarget?.name}</span>
                <p className="text-xs text-on-surface-dim font-normal font-mono">ID: {settingsTarget?.pageId}</p>
              </div>
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-5 mt-2">
            {/* Page Info Grid */}
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-surface-base/50 rounded-lg p-3 border border-white/5">
                <p className="text-[11px] text-on-surface-dim uppercase tracking-wider mb-1">Category</p>
                <p className="text-sm font-medium">{settingsTarget?.category || "General"}</p>
              </div>
              <div className="bg-surface-base/50 rounded-lg p-3 border border-white/5">
                <p className="text-[11px] text-on-surface-dim uppercase tracking-wider mb-1">Followers</p>
                <p className="text-sm font-medium">{formatFollowers(settingsTarget?.followersCount ?? 0)}</p>
              </div>
              <div className="bg-surface-base/50 rounded-lg p-3 border border-white/5">
                <p className="text-[11px] text-on-surface-dim uppercase tracking-wider mb-1 flex items-center gap-1"><User className="w-3 h-3" /> Connected By</p>
                <div className="flex items-center gap-1.5 mt-0.5">
                  {settingsTarget?.connectedAccountAvatar ? (
                    <img src={settingsTarget.connectedAccountAvatar} alt="" className="w-4 h-4 rounded-full" />
                  ) : null}
                  <p className="text-sm font-medium truncate">{settingsTarget?.connectedAccountName || "Unknown"}</p>
                </div>
              </div>
              <div className="bg-surface-base/50 rounded-lg p-3 border border-white/5">
                <p className="text-[11px] text-on-surface-dim uppercase tracking-wider mb-1 flex items-center gap-1"><Calendar className="w-3 h-3" /> Connected On</p>
                <p className="text-sm font-medium">{settingsTarget?.createdAt ? new Date(settingsTarget.createdAt).toLocaleDateString("vi-VN") : "\u2014"}</p>
              </div>
            </div>

            {/* Token Status & Replace */}
            <div className="bg-surface-base/50 rounded-lg p-4 border border-white/5 space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-xs text-on-surface-dim uppercase tracking-wider font-medium">Token Status</p>
                {settingsTarget?.tokenStatus === "active" ? (
                  <Badge variant="outline" className="bg-[rgba(78,222,163,0.1)] text-[#4edea3] border-0 text-xs">
                    <ShieldCheck className="w-3 h-3 mr-1" /> Active
                  </Badge>
                ) : (
                  <Badge variant="outline" className="bg-[rgba(255,180,171,0.1)] text-[#ffb4ab] border-0 text-xs">
                    <ShieldAlert className="w-3 h-3 mr-1" /> Expired
                  </Badge>
                )}
              </div>
              <div className="pt-2 border-t border-white/5">
                <Label className="text-xs text-on-surface-dim">Replace Access Token</Label>
                <div className="flex gap-2 mt-1.5">
                  <div className="relative flex-1">
                    <Input
                      type={settingsTokenVisible ? "text" : "password"}
                      placeholder="Paste new token here..."
                      value={settingsNewToken}
                      onChange={(e) => setSettingsNewToken(e.target.value)}
                      className="bg-surface-base border-white/10 pr-9 text-sm"
                      autoComplete="new-password"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="absolute right-0 top-0 h-full w-9 text-on-surface-dim hover:text-white"
                      onClick={() => setSettingsTokenVisible(!settingsTokenVisible)}
                    >
                      {settingsTokenVisible ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                    </Button>
                  </div>
                  <Button
                    size="sm"
                    disabled={!settingsNewToken.trim() || settingsSaving}
                    onClick={handleUpdateToken}
                    className="gradient-primary text-[#060e20] border-0 shrink-0"
                  >
                    {settingsSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : "Update"}
                  </Button>
                </div>
              </div>
            </div>

            {/* Quick Actions */}
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                className="flex-1 border-white/10 bg-transparent text-on-surface-dim hover:text-white hover:bg-surface-base"
                onClick={() => {
                  navigator.clipboard.writeText(settingsTarget?.pageId || "");
                  toast.success("Page ID copied!");
                }}
              >
                <Copy className="w-3.5 h-3.5 mr-2" /> Copy Page ID
              </Button>
              <a
                href={`https://facebook.com/${settingsTarget?.pageId}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex-1 inline-flex items-center justify-center gap-2 rounded-md border border-white/10 bg-transparent px-3 py-1.5 text-sm text-on-surface-dim hover:text-white hover:bg-surface-base transition-colors"
              >
                <ExternalLink className="w-3.5 h-3.5" /> Open on Facebook
              </a>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      
      {/* Pagination Footer */}
      <div className="flex items-center justify-between mt-4 text-sm text-on-surface-dim">
        <p>Showing {skip + 1}–{Math.min(skip + pages.length, total)} of {total} Fanpages</p>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className="h-8 w-8 p-0 border-white/10 bg-transparent text-on-surface-dim hover:text-white hover:bg-surface-base disabled:opacity-30"
            disabled={currentPage <= 1}
            onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
          >
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <span className="text-xs tabular-nums">
            Page {currentPage} / {totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            className="h-8 w-8 p-0 border-white/10 bg-transparent text-on-surface-dim hover:text-white hover:bg-surface-base disabled:opacity-30"
            disabled={currentPage >= totalPages}
            onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
          >
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>
      </div>
    </>
  );
}
