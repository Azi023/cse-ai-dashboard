'use client';

import { createContext, useContext, useState, useEffect, type ReactNode } from 'react';

type DisplayMode = 'simple' | 'pro';

interface DisplayModeContextType {
  mode: DisplayMode;
  isSimple: boolean;
  toggleMode: () => void;
  setMode: (mode: DisplayMode) => void;
}

const DisplayModeContext = createContext<DisplayModeContextType>({
  mode: 'simple',
  isSimple: true,
  toggleMode: () => {},
  setMode: () => {},
});

export function DisplayModeProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<DisplayMode>('simple');
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const saved = localStorage.getItem('cse-display-mode') as DisplayMode | null;
    if (saved === 'simple' || saved === 'pro') {
      setModeState(saved);
    }
  }, []);

  const setMode = (newMode: DisplayMode) => {
    setModeState(newMode);
    localStorage.setItem('cse-display-mode', newMode);
  };

  const toggleMode = () => {
    setMode(mode === 'simple' ? 'pro' : 'simple');
  };

  // During SSR, default to simple mode
  const effectiveMode = mounted ? mode : 'simple';

  return (
    <DisplayModeContext.Provider
      value={{
        mode: effectiveMode,
        isSimple: effectiveMode === 'simple',
        toggleMode,
        setMode,
      }}
    >
      {children}
    </DisplayModeContext.Provider>
  );
}

export function useDisplayMode() {
  return useContext(DisplayModeContext);
}
