import { createContext, useContext, useState, useCallback } from "react";
import { api } from "./api.js";

const FitnessContext = createContext(null);

export function FitnessProvider({ children }) {
  const [fitness, setFitness] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const refreshFitness = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const { data } = await api.getAthleteFitness();
      setFitness(data);
      return data;
    } catch (err) {
      const msg = err?.response?.data?.message || err?.message || "Failed to load fitness";
      setError(msg);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  const clearFitness = useCallback(() => {
    setFitness(null);
    setError("");
  }, []);

  return (
    <FitnessContext.Provider value={{ fitness, loading, error, refreshFitness, clearFitness }}>
      {children}
    </FitnessContext.Provider>
  );
}

export function useFitness() {
  const context = useContext(FitnessContext);
  if (!context) throw new Error("useFitness must be used within FitnessProvider");
  return context;
}
