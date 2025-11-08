"use client";

import { useEffect, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@clerk/nextjs";

type ProtectedLayoutProps = {
  children: ReactNode;
};

export default function ProtectedLayout({ children }: ProtectedLayoutProps) {
  const { isSignedIn, isLoaded } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (isLoaded && !isSignedIn) {
      const signInUrl = new URL("/sign-in", window.location.origin);
      signInUrl.searchParams.set("redirect_url", pathname);
      router.replace(signInUrl.toString());
    }
  }, [isSignedIn, isLoaded, pathname, router]);

  // Show nothing while loading or if not signed in
  if (!isLoaded || !isSignedIn) {
    return null;
  }

  return <>{children}</>;
}
