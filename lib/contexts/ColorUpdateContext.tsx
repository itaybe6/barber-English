import React, { createContext, useContext, useState, ReactNode, useRef } from 'react';

interface ColorUpdateContextType {
  colorUpdateTrigger: number;
  triggerColorUpdate: () => void;
  forceThemeUpdate: (callback: () => void) => void;
  forceAppRefresh: () => void;
}

const ColorUpdateContext = createContext<ColorUpdateContextType | undefined>(undefined);

export const ColorUpdateProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [colorUpdateTrigger, setColorUpdateTrigger] = useState(0);
  const forceUpdateRef = useRef<(() => void) | null>(null);

  const triggerColorUpdate = () => {
    setColorUpdateTrigger(prev => prev + 1);
    // Also trigger theme update if available
    if (forceUpdateRef.current) {
      forceUpdateRef.current();
    }
    
    // Force additional updates to ensure propagation
    setTimeout(() => {
      setColorUpdateTrigger(prev => prev + 1);
      if (forceUpdateRef.current) {
        forceUpdateRef.current();
      }
    }, 50);
  };

  const forceThemeUpdate = (callback: () => void) => {
    forceUpdateRef.current = callback;
  };

  const forceAppRefresh = () => {
    // Force multiple updates to ensure all components refresh
    setColorUpdateTrigger(prev => prev + 1);
    setTimeout(() => setColorUpdateTrigger(prev => prev + 1), 50);
    setTimeout(() => setColorUpdateTrigger(prev => prev + 1), 100);
    setTimeout(() => setColorUpdateTrigger(prev => prev + 1), 200);
    setTimeout(() => setColorUpdateTrigger(prev => prev + 1), 500);
    
    // Also trigger theme update
    if (forceUpdateRef.current) {
      forceUpdateRef.current();
      setTimeout(() => forceUpdateRef.current?.(), 100);
      setTimeout(() => forceUpdateRef.current?.(), 300);
    }
  };

  return (
    <ColorUpdateContext.Provider value={{ colorUpdateTrigger, triggerColorUpdate, forceThemeUpdate, forceAppRefresh }}>
      {children}
    </ColorUpdateContext.Provider>
  );
};

export const useColorUpdate = (): ColorUpdateContextType => {
  const context = useContext(ColorUpdateContext);
  if (context === undefined) {
    throw new Error('useColorUpdate must be used within a ColorUpdateProvider');
  }
  return context;
};
