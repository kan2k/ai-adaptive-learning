"use client";

import { SignInButton, UserButton, useUser } from "@clerk/clerk-react";
import {
  Authenticated,
  Unauthenticated,
  AuthLoading,
  useQuery,
} from "convex/react";
import { api } from "../../convex/_generated/api";

export default function Home() {
  const { user } = useUser();

  console.log(user);
  return (
    <div className="flex flex-col h-screen">
      <main className="flex-1 flex flex-col justify-center items-center">
        <Unauthenticated>
          <SignInButton />
        </Unauthenticated>
        <Authenticated>
          <UserButton />
          {user.emailAddresses[0].emailAddress}
        </Authenticated>
        <AuthLoading>
          <p>Still loading</p>
        </AuthLoading>
      </main>
      <footer className=""></footer>
    </div>
  );
}
