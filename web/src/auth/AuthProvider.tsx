// Who's signed in, for the whole app. Features read it with useAuth() and never talk to the
// backend's auth themselves. With accounts off (backend/index.ts), `enabled` is false and
// nothing here touches the network.

import { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useState } from "react";

import { type Backend, type Profile, type User, accountsEnabled, getBackend } from "../backend";

interface AuthState {
  enabled: boolean; // accounts configured for this build
  loading: boolean; // the session is still being restored
  user: User | null;
  profile: Profile | null; // null right after a first sign-in, until a display name is chosen
  backend: Backend | null;
  /** Re-read the profile, e.g. after creating or renaming it. */
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [backend, setBackend] = useState<Backend | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(accountsEnabled);

  useEffect(() => {
    const pending = getBackend();
    if (!pending) return;
    let unsubscribe = () => {};
    let live = true;
    pending.then(async (b) => {
      if (!live) return;
      setBackend(b);
      unsubscribe = b.auth.onChange((u) => setUser(u));
      setUser(await b.auth.currentUser());
      setLoading(false);
    });
    return () => {
      live = false;
      unsubscribe();
    };
  }, []);

  const refreshProfile = useCallback(async () => {
    setProfile(backend && user ? await backend.profiles.mine() : null);
  }, [backend, user]);

  useEffect(() => {
    void refreshProfile();
  }, [refreshProfile]);

  const value = useMemo(
    () => ({ enabled: accountsEnabled, loading, user, profile, backend, refreshProfile }),
    [loading, user, profile, backend, refreshProfile],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const auth = useContext(AuthContext);
  if (!auth) throw new Error("useAuth must be used inside <AuthProvider>");
  return auth;
}
