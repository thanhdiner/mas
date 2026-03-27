import { ImageResponse } from "next/og";

export const size = {
  width: 1200,
  height: 630,
};

export const contentType = "image/png";

export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          display: "flex",
          width: "100%",
          height: "100%",
          padding: "56px",
          background:
            "linear-gradient(135deg, #060e20 0%, #0b1326 55%, #171f33 100%)",
          color: "#e2e4ea",
          position: "relative",
          fontFamily: "Arial, sans-serif",
        }}
      >
        <div
          style={{
            position: "absolute",
            inset: 0,
            background:
              "radial-gradient(circle at top right, rgba(123,208,255,0.24), transparent 36%), radial-gradient(circle at bottom left, rgba(78,222,163,0.18), transparent 28%)",
          }}
        />

        <div
          style={{
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
            width: "100%",
            border: "1px solid rgba(255,255,255,0.08)",
            borderRadius: 36,
            padding: 44,
            background: "rgba(23,31,51,0.72)",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 20,
            }}
          >
            <div
              style={{
                display: "flex",
                width: 72,
                height: 72,
                alignItems: "center",
                justifyContent: "center",
                borderRadius: 20,
                background:
                  "linear-gradient(135deg, rgba(123,208,255,1), rgba(0,138,187,1))",
                color: "#060e20",
                fontSize: 38,
                fontWeight: 800,
              }}
            >
              M
            </div>
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 6,
              }}
            >
              <div
                style={{
                  fontSize: 18,
                  letterSpacing: "0.28em",
                  textTransform: "uppercase",
                  color: "#8c92a4",
                }}
              >
                Multi-Agent System
              </div>
              <div
                style={{
                  fontSize: 36,
                  fontWeight: 700,
                }}
              >
                MAS Command Center
              </div>
            </div>
          </div>

          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 18,
              maxWidth: 780,
            }}
          >
            <div
              style={{
                fontSize: 68,
                lineHeight: 1.04,
                fontWeight: 800,
                letterSpacing: "-0.04em",
              }}
            >
              Orchestrate agents, tasks, and delegation trees in one place.
            </div>
            <div
              style={{
                fontSize: 28,
                lineHeight: 1.4,
                color: "#b8c2d6",
              }}
            >
              Manage AI agent hierarchies, execute tasks, and monitor activity in
              real time.
            </div>
          </div>

          <div
            style={{
              display: "flex",
              gap: 16,
            }}
          >
            {["Hierarchy Canvas", "Task Execution", "Live Monitoring"].map(
              (label) => (
                <div
                  key={label}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    borderRadius: 999,
                    padding: "12px 20px",
                    background: "rgba(255,255,255,0.06)",
                    color: "#7bd0ff",
                    fontSize: 22,
                    fontWeight: 600,
                  }}
                >
                  {label}
                </div>
              )
            )}
          </div>
        </div>
      </div>
    ),
    size
  );
}
