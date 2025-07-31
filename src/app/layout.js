"use client";

import { ClerkProvider, useAuth } from "@clerk/clerk-react";
import { ConvexProviderWithClerk } from "convex/react-clerk";
import { ConvexReactClient } from "convex/react";
import "./globals.css";
import "katex/dist/katex.min.css";

const convex = new ConvexReactClient(process.env.NEXT_PUBLIC_CONVEX_URL);

// https://github.com/clerk/javascript/blob/main/packages/localizations/src/en-US.ts
const localization = {
  formButtonPrimary: "Start Learning",
};

export default function RootLayout({ children }) {
  return (
    <ClerkProvider
      publishableKey={process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY}
      localization={localization}
    >
      <ConvexProviderWithClerk client={convex} useAuth={useAuth}>
        <html lang="en">
          <body className="antialiased">{children}</body>
        </html>
      </ConvexProviderWithClerk>
    </ClerkProvider>
  );
}
