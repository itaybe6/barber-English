import Constants from 'expo-constants';
import { CURRENT_CLIENT } from '../config/currentClient';

// Logo mapping for different clients - now using branding folder structure
export const clientLogos = {
  JamesBarber: require('../../branding/JamesBarber/logo.png'),
  clientB: require('../../branding/clientB/logo.png'),
} as const;

// Get the current client from environment or default to clientA
export const getCurrentClient = (): keyof typeof clientLogos => {
  try {
    // First try the imported CURRENT_CLIENT
    if (CURRENT_CLIENT && CURRENT_CLIENT in clientLogos) {
      return CURRENT_CLIENT as keyof typeof clientLogos;
    }
    
    // Fallback to Constants and environment
    const client = 
      Constants.expoConfig?.extra?.CLIENT || 
      process.env.CLIENT || 
      Constants.expoConfig?.extra?.client;
    
    
    if (client && client in clientLogos) {
      return client as keyof typeof clientLogos;
    }
  } catch (error) {
    console.warn('Could not get CLIENT:', error);
  }
  
  // Default to JamesBarber if no client found or invalid client
  return 'JamesBarber';
};

// Alternative method - you can manually set the client
let currentClient: keyof typeof clientLogos = 'JamesBarber';

export const setCurrentClient = (client: keyof typeof clientLogos) => {
  currentClient = client;
};

export const getCurrentClientManual = (): keyof typeof clientLogos => {
  return currentClient;
};

// Get the logo for the current client
export const getCurrentClientLogo = () => {
  const client = getCurrentClient();
  return clientLogos[client];
};

// Get logo by client name
export const getLogoByClient = (clientName: string) => {
  if (clientName && clientName in clientLogos) {
    return clientLogos[clientName as keyof typeof clientLogos];
  }
  return clientLogos.JamesBarber; // Default fallback
};

// Export all available clients
export const availableClients = Object.keys(clientLogos) as Array<keyof typeof clientLogos>;
