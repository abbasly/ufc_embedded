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
  /** Whether ``profile`` has been loaded for the signed-in user (null then means "none yet"). */
  profileReady: boolean;
  backend: Backend | null;
  /** Re-read the profile, e.g. after creating or renaming it. */
  refreshProfile: () => Promise<void>;
  /** Arrived from a password-reset link: time to set a new password. */
  recovering: boolean;
  endRecovery: () => void;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [backend, setBackend] = useState<Backend | null>(null);
  const [user, setUser] = useState<User | null>(null);
  // The profile, tagged with whose it is: until it's loaded for the current user, there's no
  // telling "no profile yet" from "not loaded yet" (the display-name prompt waits for that).
  const [loaded, setLoaded] = useState<{ userId: string; profile: Profile | null } | null>(null);
  const [loading, setLoading] = useState(accountsEnabled);
  const [recovering, setRecovering] = useState(false);

  useEffect(() => {
    const pending = getBackend();
    if (!pending) return;
    let unsubscribe = () => {};
    let live = true;
    pending.then(async (b) => {
      if (!live) return;
      setBackend(b);
      // Keep the same object while it's the same person (token refreshes fire this too).
      const update = (u: User | null) => setUser((old) => (old?.id === u?.id && old?.email === u?.email ? old : u));
      const stopUser = b.auth.onChange(update);
      const stopRecovery = b.auth.onPasswordRecovery(() => setRecovering(true));
      unsubscribe = () => {
        stopUser();
        stopRecovery();
      };
      update(await b.auth.currentUser());
      setLoading(false);
    });
    return () => {
      live = false;
      unsubscribe();
    };
  }, []);

  const userId = user?.id ?? null;
  const refreshProfile = useCallback(async () => {
    if (!backend || !userId) return setLoaded(null);
    const profile = await backend.profiles.mine();
    setLoaded({ userId, profile });
  }, [backend, userId]);

  useEffect(() => {
    void refreshProfile();
  }, [refreshProfile]);

  const profileReady = !!userId && loaded?.userId === userId;
  const profile = profileReady ? loaded!.profile : null;
  const endRecovery = useCallback(() => setRecovering(false), []);
  const value = useMemo(
    () => ({ enabled: accountsEnabled, loading, user, profile, profileReady, backend, refreshProfile, recovering, endRecovery }),
    [loading, user, profile, profileReady, backend, refreshProfile, recovering, endRecovery],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const auth = useContext(AuthContext);
  if (!auth) throw new Error("useAuth must be used inside <AuthProvider>");
  return auth;
}
