import Constants from 'expo-constants';
import { CURRENT_CLIENT } from '../config/currentClient';

// Logo mapping for different clients
export const clientLogos = {
  clientA: require('../../assets/images/clientA-logo.png'),
  clientB: require('../../assets/images/clientB-logo.png'),
  default: require('../../assets/images/logo-03.png'), // Fallback logo
} as const;

// Get the current client from environment or default to clientA
export const getCurrentClient = (): keyof typeof clientLogos => {
  try {
    // First try the imported CURRENT_CLIENT
    if (CURRENT_CLIENT && CURRENT_CLIENT in clientLogos) {
      console.log('✅ Using CURRENT_CLIENT:', CURRENT_CLIENT);
      return CURRENT_CLIENT as keyof typeof clientLogos;
    }
    
    // Fallback to Constants and environment
    const client = 
      Constants.expoConfig?.extra?.CLIENT || 
      process.env.CLIENT || 
      Constants.expoConfig?.extra?.client ||
      Constants.expoConfig?.client;
    
    console.log('🔍 Debug - Looking for client:', {
      'CURRENT_CLIENT': CURRENT_CLIENT,
      'Constants.expoConfig?.extra?.CLIENT': Constants.expoConfig?.extra?.CLIENT,
      'process.env.CLIENT': process.env.CLIENT,
      'Constants.expoConfig?.extra?.client': Constants.expoConfig?.extra?.client,
      'Constants.expoConfig?.client': Constants.expoConfig?.client,
      'Found client': client
    });
    
    if (client && client in clientLogos) {
      console.log('✅ Using client from Constants/env:', client);
      return client as keyof typeof clientLogos;
    }
  } catch (error) {
    console.warn('Could not get CLIENT:', error);
  }
  
  // Default to clientA if no client found or invalid client
  console.log('⚠️ No client found, using default: clientA');
  return 'clientA';
};

// Alternative method - you can manually set the client
let currentClient: keyof typeof clientLogos = 'clientA';

export const setCurrentClient = (client: keyof typeof clientLogos) => {
  currentClient = client;
  console.log('🎯 Manually set client to:', client);
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
  return clientLogos.default;
};

// Export all available clients
export const availableClients = Object.keys(clientLogos).filter(key => key !== 'default') as Array<keyof typeof clientLogos>;
