"use client";

import { useState, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  BookOpen,
  Upload,
  FileText,
  Trash2,
  Search,
  Tag,
  HardDrive,
  Eye,
  X,
  Plus,
} from "lucide-react";
import { api, KnowledgeDoc } from "@/lib/api";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
}

const FILE_ICONS: Record<string, string> = {
  ".txt": "📄",
  ".md": "📝",
  ".pdf": "📕",
  ".csv": "📊",
  ".json": "🔧",
  ".py": "🐍",
  ".js": "💛",
  ".ts": "💙",
  ".html": "🌐",
  ".yaml": "⚙️",
  ".yml": "⚙️",
  ".xml": "📋",
  ".log": "📃",
  ".css": "🎨",
};

export default function KnowledgePage() {
  const queryClient = useQueryClient();
  const { data: docs = [], isLoading: loading } = useQuery({
    queryKey: ["knowledge"],
    queryFn: () => api.knowledge.list(),
  });
  const [showUpload, setShowUpload] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [selectedDoc, setSelectedDoc] = useState<(KnowledgeDoc & { textPreview?: string }) | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<{ id: string; name: string; snippet: string }[]>([]);
  const [searching, setSearching] = useState(false);

  // Upload form
  const [uploadName, setUploadName] = useState("");
  const [uploadDesc, setUploadDesc] = useState("");
  const [uploadTags, setUploadTags] = useState("");
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleUpload = async () => {
    if (!uploadFile) return;
    setUploading(true);
    try {
      await api.knowledge.upload(uploadFile, uploadName, uploadDesc, uploadTags);
      setShowUpload(false);
      setUploadFile(null);
      setUploadName("");
      setUploadDesc("");
      setUploadTags("");
      queryClient.invalidateQueries({ queryKey: ["knowledge"] });
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Upload failed");
    }
    setUploading(false);
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this document?")) return;
    try {
      await api.knowledge.delete(id);
      queryClient.invalidateQueries({ queryKey: ["knowledge"] });
    } catch {}
  };

  const handleView = async (id: string) => {
    try {
      const doc = await api.knowledge.get(id);
      setSelectedDoc(doc);
    } catch {}
  };

  const handleSearch = async () => {
    if (!searchQuery.trim()) return;
    setSearching(true);
    try {
      const results = await api.knowledge.search(searchQuery);
      setSearchResults(results);
    } catch {}
    setSearching(false);
  };

  const filteredDocs = searchQuery
    ? docs.filter(
        (d) =>
          d.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          d.filename.toLowerCase().includes(searchQuery.toLowerCase()) ||
          d.tags.some((t) => t.toLowerCase().includes(searchQuery.toLowerCase()))
      )
    : docs;

  return (
    <>
      <PageHeader
        title="Knowledge Base"
        description="Upload documents for agent RAG context and long-term memory"
        actions={
          <Button
            onClick={() => setShowUpload(true)}
            className="gradient-primary text-[#060e20] font-medium border-0"
          >
            <Upload className="w-4 h-4 mr-2" /> Upload Document
          </Button>
        }
      />

      {/* Search bar */}
      <div
        className="flex items-center gap-3 mb-6 p-3 rounded-xl"
        style={{ background: "var(--surface-container)", border: "1px solid rgba(255,255,255,0.05)" }}
      >
        <Search className="w-4 h-4 text-on-surface-dim shrink-0" />
        <Input
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") handleSearch(); }}
          placeholder="Search documents by name, filename, or tag..."
          className="bg-transparent border-0 text-foreground placeholder:text-on-surface-dim flex-1"
        />
        {searchQuery && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => { setSearchQuery(""); setSearchResults([]); }}
            className="text-on-surface-dim"
          >
            <X className="w-4 h-4" />
          </Button>
        )}
      </div>

      {/* Search results */}
      {searchResults.length > 0 && (
        <div className="mb-6 space-y-2">
          <h3 className="text-sm font-heading font-semibold text-accent-cyan mb-3 flex items-center gap-2">
            <Search className="w-4 h-4" /> Search Results
          </h3>
          {searchResults.map((r) => (
            <div
              key={r.id}
              className="rounded-lg p-4"
              style={{ background: "var(--surface-base)", border: "1px solid rgba(123,208,255,0.1)" }}
            >
              <p className="text-sm font-semibold mb-1">{r.name}</p>
              <p className="text-xs leading-relaxed" style={{ color: "var(--on-surface-dim)" }}>
                {r.snippet}
              </p>
            </div>
          ))}
        </div>
      )}

      {/* Documents Grid */}
      {loading ? (
        <div className="text-center py-20 text-sm" style={{ color: "var(--on-surface-dim)" }}>Loading...</div>
      ) : filteredDocs.length === 0 ? (
        <div className="text-center py-20 rounded-xl" style={{ background: "var(--surface-container)" }}>
          <BookOpen className="w-12 h-12 mx-auto mb-4" style={{ color: "var(--on-surface-dim)", opacity: 0.4 }} />
          <p className="text-lg font-heading font-medium mb-2">No documents yet</p>
          <p className="text-sm mb-4" style={{ color: "var(--on-surface-dim)" }}>
            Upload documents to give agents contextual knowledge
          </p>
          <Button onClick={() => setShowUpload(true)} className="gradient-primary text-[#060e20] font-medium border-0">
            <Plus className="w-4 h-4 mr-2" /> Upload First Document
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredDocs.map((doc, i) => (
            <div
              key={doc.id}
              className="rounded-xl p-5 transition-all duration-200 hover:scale-[1.01] animate-slide-in group"
              style={{
                background: "var(--surface-base)",
                border: "1px solid rgba(255,255,255,0.05)",
                animationDelay: `${i * 40}ms`,
              }}
            >
              {/* File icon + name */}
              <div className="flex items-start gap-3 mb-3">
                <div
                  className="w-10 h-10 rounded-lg flex items-center justify-center text-xl shrink-0"
                  style={{ background: "var(--surface-container)" }}
                >
                  {FILE_ICONS[doc.fileType] || "📄"}
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="font-heading text-sm font-semibold text-foreground truncate">{doc.name}</h3>
                  <p className="text-[11px] truncate" style={{ color: "var(--on-surface-dim)" }}>{doc.filename}</p>
                </div>
              </div>

              {/* Description */}
              {doc.description && (
                <p className="text-xs mb-3 line-clamp-2 leading-relaxed" style={{ color: "var(--on-surface-dim)" }}>
                  {doc.description}
                </p>
              )}

              {/* Tags */}
              {doc.tags.length > 0 && (
                <div className="flex flex-wrap gap-1 mb-3">
                  {doc.tags.map((tag) => (
                    <span
                      key={tag}
                      className="px-2 py-0.5 rounded-full text-[10px] font-medium"
                      style={{
                        background: "rgba(123,208,255,0.08)",
                        color: "#7bd0ff",
                        border: "1px solid rgba(123,208,255,0.12)",
                      }}
                    >
                      <Tag className="w-2 h-2 inline mr-0.5 -mt-[1px]" /> {tag}
                    </span>
                  ))}
                </div>
              )}

              {/* Meta + actions */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3 text-[10px]" style={{ color: "var(--on-surface-dim)" }}>
                  <span className="flex items-center gap-1">
                    <HardDrive className="w-2.5 h-2.5" /> {formatBytes(doc.fileSize)}
                  </span>
                  <span>{new Date(doc.uploadedAt).toLocaleDateString()}</span>
                </div>
                <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <Button variant="ghost" size="sm" onClick={() => handleView(doc.id)} className="text-on-surface-dim hover:text-foreground h-7 w-7 p-0">
                    <Eye className="w-3.5 h-3.5" />
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => handleDelete(doc.id)} className="text-on-surface-dim hover:text-[#ffb4ab] h-7 w-7 p-0">
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Upload Dialog */}
      <Dialog open={showUpload} onOpenChange={setShowUpload}>
        <DialogContent className="sm:max-w-lg" style={{ background: "var(--surface-high)", borderColor: "rgba(255,255,255,0.1)" }}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 font-heading">
              <Upload className="w-5 h-5 text-accent-cyan" /> Upload Document
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            {/* Dropzone */}
            <div
              className="rounded-xl p-8 text-center cursor-pointer transition-all hover:border-accent-cyan/30"
              style={{
                background: "var(--surface-container)",
                border: "2px dashed rgba(123,208,255,0.15)",
              }}
              onClick={() => fileInputRef.current?.click()}
            >
              <input
                ref={fileInputRef}
                type="file"
                className="hidden"
                accept=".txt,.md,.pdf,.csv,.json,.py,.js,.ts,.html,.css,.yaml,.yml,.xml,.log"
                onChange={(e) => {
                  if (e.target.files?.[0]) {
                    setUploadFile(e.target.files[0]);
                    if (!uploadName) setUploadName(e.target.files[0].name.split(".")[0]);
                  }
                }}
              />
              {uploadFile ? (
                <div>
                  <FileText className="w-8 h-8 mx-auto mb-2 text-accent-cyan" />
                  <p className="text-sm font-medium">{uploadFile.name}</p>
                  <p className="text-[11px]" style={{ color: "var(--on-surface-dim)" }}>
                    {formatBytes(uploadFile.size)}
                  </p>
                </div>
              ) : (
                <div>
                  <Upload className="w-8 h-8 mx-auto mb-2" style={{ color: "var(--on-surface-dim)" }} />
                  <p className="text-sm">Click to select a file</p>
                  <p className="text-[10px] mt-1" style={{ color: "var(--on-surface-dim)" }}>
                    Supports: .txt, .md, .pdf, .csv, .json, .py, .js, .ts, .html, .css, .yaml
                  </p>
                </div>
              )}
            </div>

            <div>
              <label className="text-xs font-medium text-on-surface-dim uppercase tracking-wider">Document Name</label>
              <Input
                value={uploadName}
                onChange={(e) => setUploadName(e.target.value)}
                placeholder="e.g. API Documentation"
                className="mt-1 bg-surface-container border-0 text-foreground"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-on-surface-dim uppercase tracking-wider">Description</label>
              <Textarea
                value={uploadDesc}
                onChange={(e) => setUploadDesc(e.target.value)}
                placeholder="Brief description of this document..."
                rows={2}
                className="mt-1 bg-surface-container border-0 text-foreground resize-none"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-on-surface-dim uppercase tracking-wider">Tags (comma separated)</label>
              <Input
                value={uploadTags}
                onChange={(e) => setUploadTags(e.target.value)}
                placeholder="e.g. api, docs, reference"
                className="mt-1 bg-surface-container border-0 text-foreground"
              />
            </div>

            <Button
              onClick={handleUpload}
              disabled={!uploadFile || uploading}
              className="w-full gradient-primary text-[#060e20] font-semibold border-0"
            >
              {uploading ? "Uploading..." : "Upload Document"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Preview Dialog */}
      <Dialog open={!!selectedDoc} onOpenChange={(open) => { if (!open) setSelectedDoc(null); }}>
        <DialogContent className="sm:max-w-2xl" style={{ background: "var(--surface-high)", borderColor: "rgba(255,255,255,0.1)" }}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 font-heading">
              <FileText className="w-5 h-5 text-accent-cyan" />
              {selectedDoc?.name}
            </DialogTitle>
          </DialogHeader>
          {selectedDoc && (
            <div className="space-y-4 py-2 max-h-[60vh] overflow-y-auto">
              <div className="flex gap-4 text-xs" style={{ color: "var(--on-surface-dim)" }}>
                <span>📁 {selectedDoc.filename}</span>
                <span>💾 {formatBytes(selectedDoc.fileSize)}</span>
                <span>📅 {new Date(selectedDoc.uploadedAt).toLocaleDateString()}</span>
              </div>
              {selectedDoc.description && <p className="text-sm">{selectedDoc.description}</p>}
              {selectedDoc.tags.length > 0 && (
                <div className="flex gap-1">
                  {selectedDoc.tags.map((t) => (
                    <span key={t} className="px-2 py-0.5 rounded-full text-[10px]" style={{ background: "rgba(123,208,255,0.08)", color: "#7bd0ff" }}>
                      {t}
                    </span>
                  ))}
                </div>
              )}
              <div>
                <h4 className="text-xs font-semibold uppercase tracking-wider text-on-surface-dim mb-2">Content Preview</h4>
                <pre
                  className="text-xs p-4 rounded-lg font-mono overflow-auto whitespace-pre-wrap max-h-80 leading-relaxed"
                  style={{ background: "var(--surface-container)", color: "var(--on-surface-dim)" }}
                >
                  {selectedDoc.textPreview || "No preview available."}
                </pre>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
