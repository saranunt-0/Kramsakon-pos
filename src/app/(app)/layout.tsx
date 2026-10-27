"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/auth";
import { AppShell } from "@/components/app-shell";
import { CartProvider } from "@/components/cart";
import { CatalogProvider } from "@/components/catalog";
import { PageLoading } from "@/components/ui";

// Everything inside (app) needs an active login.
export default function AppLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { loading, session, profile, settings } = useAuth();
  const ready = !loading && session && profile?.active && settings;

  useEffect(() => {
    if (!loading && (!session || !profile?.active)) router.replace("/login");
  }, [loading, session, profile, router]);

  if (!ready) return <PageLoading />;

  return (
    <CatalogProvider>
      <CartProvider>
        <AppShell>{children}</AppShell>
      </CartProvider>
    </CatalogProvider>
  );
}
