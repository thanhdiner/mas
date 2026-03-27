import { ImageResponse } from "next/og";

export const size = {
  width: 180,
  height: 180,
};

export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          display: "flex",
          width: "100%",
          height: "100%",
          alignItems: "center",
          justifyContent: "center",
          borderRadius: 36,
          background:
            "radial-gradient(circle at top left, #7bd0ff 0%, #008abb 45%, #060e20 100%)",
          color: "#f2fbff",
          fontSize: 92,
          fontWeight: 800,
          letterSpacing: "-0.08em",
        }}
      >
        M
      </div>
    ),
    size
  );
}
