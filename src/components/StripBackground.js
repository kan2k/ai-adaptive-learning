export function StripBackground() {
  return (
    <div
      className="absolute inset-0 bg-yellow-400"
      style={{
        backgroundImage: `repeating-linear-gradient(
            45deg,
            transparent,
            transparent 10px,
            rgba(255, 255, 255, 0.1) 10px,
            rgba(255, 255, 255, 0.1) 20px
          )`,
        backgroundSize: "28.28px 28.28px",
        animation: "moveStripes 2s linear infinite",
      }}
    />
  );
}
