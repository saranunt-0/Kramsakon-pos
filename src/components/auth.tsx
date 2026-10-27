"use client";

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import type { Profile, Settings } from "@/lib/types";

interface AuthState {
  loading: boolean;
  session: Session | null;
  profile: Profile | null;
  settings: Settings | null;
  isAdmin: boolean;
  refreshSettings: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [settings, setSettings] = useState<Settings | null>(null);

  const refreshSettings = useCallback(async () => {
    const { data } = await supabase().from("settings").select("*").maybeSingle();
    setSettings(data as Settings | null);
  }, []);

  const load = useCallback(
    async (s: Session | null) => {
      setSession(s);
      if (!s) {
        setProfile(null);
        setSettings(null);
        setLoading(false);
        return;
      }
      const { data } = await supabase().from("profiles").select("*").eq("id", s.user.id).maybeSingle();
      setProfile(data as Profile | null);
      if (data?.active) await refreshSettings();
      setLoading(false);
    },
    [refreshSettings],
  );

  useEffect(() => {
    const client = supabase();
    client.auth.getSession().then(({ data }) => load(data.session));
    const { data: sub } = client.auth.onAuthStateChange((event, s) => {
      // Token refreshes happen every hour; only reload on real changes.
      if (event === "SIGNED_IN" || event === "SIGNED_OUT" || event === "USER_UPDATED") {
        setTimeout(() => load(s), 0);
      } else if (event === "TOKEN_REFRESHED") {
        setSession(s);
      }
    });
    return () => sub.subscription.unsubscribe();
  }, [load]);

  const signOut = useCallback(async () => {
    await supabase().auth.signOut();
  }, []);

  return (
    <AuthContext.Provider
      value={{
        loading,
        session,
        profile,
        settings,
        isAdmin: profile?.role === "admin" && profile.active,
        refreshSettings,
        signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}

/** Settings are always loaded inside the app layout, so pages can rely on them. */
export function useSettings(): Settings {
  const { settings } = useAuth();
  if (!settings) throw new Error("Settings not loaded");
  return settings;
}
