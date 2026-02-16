import { createContext, useContext, useState, useCallback } from "react";

const AuthContext = createContext(null);
const TOKEN_KEY = "endura_token";
const USER_KEY = "endura_user";
const LEGACY_TOKEN_KEY = "vantage_token";
const LEGACY_USER_KEY = "vantage_user";

export function AuthProvider({ children }) {
  const [token, setToken] = useState(
    localStorage.getItem(TOKEN_KEY) || localStorage.getItem(LEGACY_TOKEN_KEY) || ""
  );
  const [user, setUser] = useState(() => {
    const stored = localStorage.getItem(USER_KEY) || localStorage.getItem(LEGACY_USER_KEY);
    try {
      return stored ? JSON.parse(stored) : null;
    } catch {
      return null;
    }
  });

  const saveAuth = useCallback((data) => {
    localStorage.setItem(TOKEN_KEY, data.token);
    localStorage.removeItem(LEGACY_TOKEN_KEY);
    localStorage.setItem(
      USER_KEY,
      JSON.stringify({ _id: data._id, username: data.username, email: data.email })
    );
    localStorage.removeItem(LEGACY_USER_KEY);
    setToken(data.token);
    setUser({ _id: data._id, username: data.username, email: data.email });
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    localStorage.removeItem(LEGACY_TOKEN_KEY);
    localStorage.removeItem(LEGACY_USER_KEY);
    setToken("");
    setUser(null);
  }, []);

  const isAuthenticated = Boolean(token && user);

  return (
    <AuthContext.Provider value={{ token, user, isAuthenticated, saveAuth, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within AuthProvider");
  return context;
}
