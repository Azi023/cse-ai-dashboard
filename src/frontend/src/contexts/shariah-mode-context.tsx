'use client';

import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';
import api from '@/lib/api';

interface ShariahModeContextType {
  shariahMode: boolean;
  loading: boolean;
  toggleShariahMode: () => void;
  setShariahMode: (enabled: boolean) => void;
}

const ShariahModeContext = createContext<ShariahModeContextType>({
  shariahMode: true,
  loading: true,
  toggleShariahMode: () => {},
  setShariahMode: () => {},
});

export function ShariahModeProvider({ children }: { children: ReactNode }) {
  const [shariahMode, setShariahModeState] = useState(true);
  const [loading, setLoading] = useState(true);

  // Fetch from backend on mount
  useEffect(() => {
    api
      .get('/user/preferences')
      .then((res) => {
        setShariahModeState(res.data.shariah_mode ?? true);
      })
      .catch(() => {
        // If not authenticated or endpoint fails, use localStorage fallback
        const saved = localStorage.getItem('cse-shariah-mode');
        if (saved !== null) {
          setShariahModeState(saved === 'true');
        }
      })
      .finally(() => setLoading(false));
  }, []);

  const setShariahMode = useCallback((enabled: boolean) => {
    setShariahModeState(enabled);
    localStorage.setItem('cse-shariah-mode', String(enabled));
    // Persist to backend (fire-and-forget)
    api.patch('/user/preferences', { shariah_mode: enabled }).catch(() => {});
  }, []);

  const toggleShariahMode = useCallback(() => {
    setShariahMode(!shariahMode);
  }, [shariahMode, setShariahMode]);

  return (
    <ShariahModeContext.Provider
      value={{
        shariahMode,
        loading,
        toggleShariahMode,
        setShariahMode,
      }}
    >
      {children}
    </ShariahModeContext.Provider>
  );
}

export function useShariahMode() {
  return useContext(ShariahModeContext);
}
