import { createContext, useContext, useState, useCallback } from "react";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [token, setToken] = useState(localStorage.getItem("vantage_token") || "");
  const [user, setUser] = useState(() => {
    const stored = localStorage.getItem("vantage_user");
    return stored ? JSON.parse(stored) : null;
  });

  const saveAuth = useCallback((data) => {
    localStorage.setItem("vantage_token", data.token);
    localStorage.setItem(
      "vantage_user",
      JSON.stringify({ _id: data._id, username: data.username, email: data.email })
    );
    setToken(data.token);
    setUser({ _id: data._id, username: data.username, email: data.email });
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem("vantage_token");
    localStorage.removeItem("vantage_user");
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
