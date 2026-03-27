import { ImageResponse } from "next/og";

export const size = {
  width: 1200,
  height: 630,
};

export const contentType = "image/png";

export default function TwitterImage() {
  return new ImageResponse(
    (
      <div
        style={{
          display: "flex",
          width: "100%",
          height: "100%",
          padding: "54px",
          background:
            "linear-gradient(135deg, #060e20 0%, #131b2e 50%, #171f33 100%)",
          color: "#e2e4ea",
          fontFamily: "Arial, sans-serif",
        }}
      >
        <div
          style={{
            display: "flex",
            width: "100%",
            height: "100%",
            borderRadius: 34,
            border: "1px solid rgba(255,255,255,0.08)",
            background:
              "radial-gradient(circle at top left, rgba(123,208,255,0.18), transparent 28%), rgba(23,31,51,0.72)",
            padding: "42px 46px",
            justifyContent: "space-between",
          }}
        >
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              justifyContent: "space-between",
              maxWidth: 700,
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 18,
              }}
            >
              <div
                style={{
                  display: "flex",
                  width: 64,
                  height: 64,
                  alignItems: "center",
                  justifyContent: "center",
                  borderRadius: 18,
                  background:
                    "linear-gradient(135deg, rgba(123,208,255,1), rgba(0,138,187,1))",
                  color: "#060e20",
                  fontSize: 34,
                  fontWeight: 800,
                }}
              >
                M
              </div>
              <div
                style={{
                  fontSize: 34,
                  fontWeight: 700,
                }}
              >
                MAS
              </div>
            </div>

            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 16,
              }}
            >
              <div
                style={{
                  fontSize: 64,
                  lineHeight: 1.05,
                  fontWeight: 800,
                  letterSpacing: "-0.04em",
                }}
              >
                AI agent orchestration with tree-based delegation.
              </div>
              <div
                style={{
                  fontSize: 28,
                  color: "#b8c2d6",
                }}
              >
                Agents, tasks, execution timelines, and hierarchy canvas.
              </div>
            </div>
          </div>

          <div
            style={{
              display: "flex",
              alignItems: "flex-end",
              color: "#7bd0ff",
              fontSize: 24,
              fontWeight: 600,
            }}
          >
            multi-agent system
          </div>
        </div>
      </div>
    ),
    size
  );
}
