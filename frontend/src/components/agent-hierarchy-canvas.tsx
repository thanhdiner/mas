"use client";

import { ReactFlow, Background, BackgroundVariant, Controls, MiniMap, Panel, ConnectionMode } from "@xyflow/react";
import type { NodeTypes, EdgeTypes } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import Link from "next/link";
import { Play, Square, Loader2, Save, Undo2, LayoutGrid, AlertTriangle, Plus, GitBranch, X, Bot, Info, Unlink } from "lucide-react";

import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { NODE_COLORS } from "./canvas/constants";
import { AgentNode } from "./canvas/AgentNode";
import { DeletableEdge } from "./canvas/DeletableEdge";
import { SidebarInspector } from "./canvas/SidebarInspector";
import { RunWorkflowDialog } from "./canvas/RunWorkflowDialog";
import { ExecutionLog } from "./canvas/ExecutionLog";
import { useCanvasGraph } from "./canvas/useCanvasGraph";
import { useCanvasExecution } from "./canvas/useCanvasExecution";

const nodeTypes: NodeTypes = { n8nNode: AgentNode };
const edgeTypes: EdgeTypes = { deletableEdge: DeletableEdge };

export function AgentHierarchyCanvas() {
  /* ---- graph state & actions ---- */
  const graph = useCanvasGraph();

  /* ---- execution target: selected agent or root ---- */
  const execAgent = graph.selectedAgent ?? graph.rootAgents[0] ?? null;

  /* ---- execution state & actions ---- */
  const exec = useCanvasExecution({
    rootAgentId: execAgent?.id,
    rootAgentName: execAgent?.name,
    setNodes: graph.setNodes,
    setEdges: graph.setEdges,
  });

  /* ---------- render ---------- */
  return (
    <div className="flex flex-col h-[calc(100vh-2rem)]">
      <PageHeader
        title="Agent Canvas"
        className="mb-3 shrink-0"
        description="Visual workflow — connect agents to define delegation chains."
        actions={
          <>
            {!exec.isExecuting ? (
              <Button
                onClick={() => exec.setShowRunDialog(true)}
                className="border-0 font-medium text-white hover:opacity-90"
                style={{ background: "linear-gradient(135deg, #4edea3, #00c853)" }}
                disabled={graph.agents.length === 0}
              >
                <Play className="mr-2 h-4 w-4" />
                {graph.selectedAgent
                  ? `Run ${graph.selectedAgent.name}`
                  : "Run Workflow"}
              </Button>
            ) : (
              <Button
                onClick={() => { exec.wsRef.current?.close(); exec.setIsExecuting(false); }}
                className="border-0 font-medium text-white hover:opacity-90"
                style={{ background: "#ff6d5a" }}
              >
                <Square className="mr-2 h-4 w-4" />
                Stop
              </Button>
            )}
            <Link href="/agents">
              <Button variant="secondary" className="border-0 bg-surface-high text-foreground">
                <GitBranch className="mr-2 h-4 w-4" />
                All Agents
              </Button>
            </Link>
            <Link href="/agents/new">
              <Button className="gradient-primary border-0 font-medium text-[#060e20] hover:opacity-90">
                <Plus className="mr-2 h-4 w-4" />
                New Agent
              </Button>
            </Link>
          </>
        }
      />

      {/* Banners */}
      {(graph.loadError || graph.statusMessage) && (
        <div className="mb-3 space-y-2">
          {graph.loadError && (
            <div className="flex items-center gap-3 rounded-lg px-4 py-2.5 text-sm" style={{ background: "rgba(255,180,171,0.12)", color: "#ffb4ab" }}>
              <AlertTriangle className="h-4 w-4 shrink-0" />
              <p className="flex-1">{graph.loadError}</p>
              <button onClick={() => graph.setLoadError("")}><X className="h-4 w-4" /></button>
            </div>
          )}
          {graph.statusMessage && (
            <div className="flex items-center gap-3 rounded-lg px-4 py-2.5 text-sm" style={{ background: "rgba(78,222,163,0.12)", color: "#4edea3" }}>
              <p className="flex-1">{graph.statusMessage}</p>
              <button onClick={() => graph.setStatusMessage("")}><X className="h-4 w-4" /></button>
            </div>
          )}
        </div>
      )}

      {graph.loading ? (
        <div className="flex items-center justify-center rounded-2xl py-24 text-sm" style={{ background: "#1a1d26", color: "rgba(232,234,237,0.5)" }}>
          <Loader2 className="mr-2 h-5 w-5 animate-spin" />
          Loading canvas...
        </div>
      ) : graph.agents.length === 0 ? (
        <div className="rounded-2xl px-6 py-20 text-center" style={{ background: "#1a1d26" }}>
          <Bot className="mx-auto mb-4 h-12 w-12" style={{ color: "rgba(232,234,237,0.3)" }} />
          <p className="font-heading text-xl font-semibold" style={{ color: "#e8eaed" }}>No agents yet</p>
          <p className="mx-auto mt-2 max-w-md text-sm" style={{ color: "rgba(232,234,237,0.5)" }}>
            Create agents to start building your workflow.
          </p>
          <Link href="/agents/new" className="mt-6 inline-flex">
            <Button className="gradient-primary border-0 font-medium text-[#060e20] hover:opacity-90">
              <Plus className="mr-2 h-4 w-4" />
              Create Agent
            </Button>
          </Link>
        </div>
      ) : (
        <div 
          className="relative overflow-hidden rounded-2xl border border-white/5 flex-1 min-h-[400px]"
        >
          {/* ---- Canvas ---- */}
          <div 
            className="w-full h-full relative" 
            style={{ background: "#14151a" }}
          >
            {/* CSS for edge delete button hover */}
            <style>{`
              .react-flow__edge:hover .edge-delete-btn,
              .react-flow__edge.selected .edge-delete-btn {
                opacity: 1 !important;
                pointer-events: auto !important;
              }
              .edge-delete-btn {
                opacity: 0;
                transition: opacity 0.15s ease;
              }
              .react-flow__connection-line {
                stroke: #7bd0ff !important;
                stroke-width: 2 !important;
                stroke-dasharray: 5 5;
              }
              .react-flow__edge.selected path:first-of-type ~ path {
                stroke: #7bd0ff !important;
              }
            `}</style>

            <ReactFlow
              nodes={graph.nodes}
              edges={graph.edges}
              onNodesChange={graph.onNodesChange}
              onEdgesChange={graph.onEdgesChange}
              onConnect={graph.onConnect}
              onEdgesDelete={graph.onEdgesDelete}
              onNodeClick={graph.onNodeClick}
              onPaneClick={graph.onPaneClick}
              onNodeDragStop={graph.onNodeDragStop}
              nodeTypes={nodeTypes}
              edgeTypes={edgeTypes}
              isValidConnection={graph.isValidConnection}
              connectionMode={ConnectionMode.Loose}
              fitView
              fitViewOptions={{ padding: 0.2, maxZoom: 1.5 }}
              defaultEdgeOptions={{ type: "deletableEdge" }}
              deleteKeyCode={["Backspace", "Delete"]}
              proOptions={{ hideAttribution: true }}
              style={{ background: "transparent" }}
              connectionLineStyle={{
                stroke: "#7bd0ff",
                strokeWidth: 2,
                strokeDasharray: "5 5",
              }}
            >
              <Background
                variant={BackgroundVariant.Dots}
                gap={20}
                size={1.5}
                color="rgba(255,255,255,0.06)"
              />
              <Controls
                showInteractive={false}
                className="!bg-[#2a2e3a] !border-white/10 !rounded-lg !shadow-xl [&>button]:!bg-transparent [&>button]:!border-white/5 [&>button]:!text-white/50 [&>button:hover]:!bg-white/10 [&>button:hover]:!text-white"
              />
              <MiniMap
                nodeColor={() => "rgba(123,208,255,0.4)"}
                maskColor="rgba(26,29,38,0.9)"
                className="!bg-[#2a2e3a] !rounded-lg !border-white/10 transition-transform duration-200"
                style={{ transform: graph.selectedAgent ? "translateX(-330px)" : "none", transformOrigin: "bottom right" }}
                pannable
                zoomable
              />

              {/* Top-right toolbar */}
              <Panel 
                position="top-right" 
                className="flex items-center gap-2 transition-transform duration-200"
                style={{ transform: graph.selectedAgent ? "translateX(-330px)" : "none" }}
              >
                {graph.selectedAgent && (
                  <button
                    onClick={graph.disconnectSelected}
                    className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium transition-colors hover:brightness-125"
                    style={{ background: "#2a2e3a", color: "#ffb4ab" }}
                    title="Disconnect all"
                  >
                    <Unlink className="h-3.5 w-3.5" />
                    Disconnect
                  </button>
                )}

                <button
                  onClick={graph.autoLayout}
                  className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium transition-colors hover:brightness-125"
                  style={{ background: "#2a2e3a", color: "#e8eaed" }}
                  title="Auto-arrange"
                >
                  <LayoutGrid className="h-3.5 w-3.5" style={{ color: "#7bd0ff" }} />
                  Tidy Up
                </button>

                {graph.isDirty && (
                  <>
                    <button
                      onClick={graph.revertChanges}
                      className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium transition-colors hover:brightness-125"
                      style={{ background: "#2a2e3a", color: "#e8eaed" }}
                      title="Revert unsaved changes"
                    >
                      <Undo2 className="h-3.5 w-3.5" />
                      Revert
                    </button>
                    <button
                      onClick={graph.saveHierarchy}
                      disabled={graph.saving}
                      className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold transition-colors hover:brightness-110"
                      style={{ background: "#ff6d5a", color: "#fff" }}
                    >
                      {graph.saving ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Save className="h-3.5 w-3.5" />
                      )}
                      Save
                    </button>
                  </>
                )}
              </Panel>

              {/* Bottom hint */}
              <Panel position="bottom-center">
                <div
                  className="rounded-lg px-4 py-1.5 text-[10px] flex items-center gap-3"
                  style={{ background: "#2a2e3a", color: "rgba(232,234,237,0.45)" }}
                >
                  <span>Drag to move</span>
                  <span className="w-px h-2.5 bg-white/10" />
                  <span>Pull handle → connect</span>
                  <span className="w-px h-2.5 bg-white/10" />
                  <span>Hover edge → × to delete</span>
                  <span className="w-px h-2.5 bg-white/10" />
                  <span>Scroll to zoom</span>
                </div>
              </Panel>
            </ReactFlow>
          </div>

          {/* ---- Sidebar Inspector (Floating) ---- */}
          {graph.selectedAgent && (
            <div
              className="absolute top-0 right-0 h-full w-[320px] border-l border-white/10 flex flex-col shadow-2xl z-10 animate-in slide-in-from-right-8 duration-200"
              style={{ background: "rgba(31,34,44,0.95)", backdropFilter: "blur(12px)" }}
            >
              <button
                onClick={() => graph.setSelectedNodeId(null)}
                className="absolute top-4 right-4 z-20 p-1 rounded-md transition-colors hover:bg-white/10"
              >
                <X className="h-4 w-4 text-white/50 hover:text-white" />
              </button>
              <SidebarInspector
                key={graph.selectedAgent.id}
                agent={graph.selectedAgent}
                agents={graph.agents}
                edges={graph.edges}
                selectedNodeId={graph.selectedNodeId!}
                setSelectedNodeId={graph.setSelectedNodeId}
                disconnectSelected={graph.disconnectSelected}
                removeEdgeBetween={graph.removeEdgeBetween}
                hierarchyInfo={graph.hierarchyInfo}
                colorIndex={graph.agents.findIndex((a) => a.id === graph.selectedAgent!.id) % NODE_COLORS.length}
                onAgentUpdated={graph.onAgentUpdated}
              />
            </div>
          )}
        </div>
      )}

      {/* ---- Run Dialog Modal ---- */}
      <RunWorkflowDialog
        showDialog={exec.showRunDialog}
        setShowDialog={exec.setShowRunDialog}
        runTitle={exec.runTitle}
        setRunTitle={exec.setRunTitle}
        runInput={exec.runInput}
        setRunInput={exec.setRunInput}
        rootAgents={graph.rootAgents}
        runWorkflow={exec.runWorkflow}
      />

      {/* ---- Execution Log Panel ---- */}
      <ExecutionLog
         execLog={exec.execLog}
         isExecuting={exec.isExecuting}
         execTaskId={exec.execTaskId}
         resetAllExecStates={exec.resetAllExecStates}
      />

      {/* Global CSS */}
      <style>{`
        .react-flow__edge-path {
          transition: stroke 0.15s ease, stroke-width 0.15s ease;
        }
        .react-flow__handle {
          transition: all 0.15s ease;
          cursor: crosshair;
        }
        .react-flow__handle:hover,
        .handle-glow:hover {
          transform: scale(1.4);
          box-shadow: 0 0 10px rgba(123,208,255,0.6), 0 0 20px rgba(123,208,255,0.3);
        }
        .react-flow__edge:hover .react-flow__edge-path {
          stroke: rgba(123,208,255,0.6) !important;
          stroke-width: 2.5px !important;
        }
        .react-flow .react-flow__node .react-flow__handle {
          width: 14px;
          height: 14px;
        }
        .custom-scrollbar::-webkit-scrollbar {
          width: 4px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: transparent;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: rgba(255,255,255,0.1);
          border-radius: 4px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: rgba(255,255,255,0.2);
        }
      `}</style>
    </div>
  );
}
