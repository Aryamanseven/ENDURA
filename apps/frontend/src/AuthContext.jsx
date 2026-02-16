import { createContext, useContext, useEffect, useCallback, useState } from "react";
import { useUser, useAuth as useClerkAuth } from "@clerk/clerk-react";
import { api } from "./api.js";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const { isSignedIn, user: clerkUser, isLoaded } = useUser();
  const { getToken, signOut } = useClerkAuth();
  const [synced, setSynced] = useState(false);

  // Expose getToken globally so api.js can use it
  useEffect(() => {
    if (isLoaded) {
      window.__clerkGetToken = isSignedIn ? getToken : null;
    }
  }, [isLoaded, isSignedIn, getToken]);

  // Sync profile to backend once after sign-in
  useEffect(() => {
    if (!isSignedIn || synced) return;
    api.syncProfile({
      username: clerkUser?.fullName || clerkUser?.firstName || clerkUser?.primaryEmailAddress?.emailAddress?.split("@")[0] || "runner",
      email: clerkUser?.primaryEmailAddress?.emailAddress || ""
    }).catch(() => {});
    setSynced(true);
  }, [isSignedIn, synced, clerkUser]);

  const logout = useCallback(() => {
    window.__clerkGetToken = null;
    setSynced(false);
    signOut();
  }, [signOut]);

  const user = isSignedIn && clerkUser
    ? {
        _id: clerkUser.id,
        username: clerkUser.fullName || clerkUser.firstName || clerkUser.primaryEmailAddress?.emailAddress?.split("@")[0] || "",
        email: clerkUser.primaryEmailAddress?.emailAddress || ""
      }
    : null;

  return (
    <AuthContext.Provider
      value={{
        token: isSignedIn ? "clerk" : "",
        user,
        isAuthenticated: Boolean(isSignedIn),
        isLoaded,
        logout,
        saveAuth: () => {} // no-op, Clerk manages this
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within AuthProvider");
  return context;
}
