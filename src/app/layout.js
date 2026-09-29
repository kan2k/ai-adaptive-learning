import "./globals.css";
import "katex/dist/katex.min.css";

export const metadata = {
  title: "AI Adaptive Learning",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
