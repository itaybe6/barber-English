import Constants from 'expo-constants';
import { CURRENT_CLIENT } from '../config/currentClient';

// Logo mapping — every path must exist (Metro resolves at bundle time).
export const clientLogos = {
  KetyCooper: require('../../branding/KetyCooper/logo.png'),
  EliApp: require('../../branding/EliApp/logo.png'),
} as const;

const DEFAULT_CLIENT: keyof typeof clientLogos = 'KetyCooper';

export const getCurrentClient = (): keyof typeof clientLogos => {
  try {
    if (CURRENT_CLIENT && CURRENT_CLIENT in clientLogos) {
      return CURRENT_CLIENT as keyof typeof clientLogos;
    }

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

  return DEFAULT_CLIENT;
};

let currentClient: keyof typeof clientLogos = DEFAULT_CLIENT;

export const setCurrentClient = (client: keyof typeof clientLogos) => {
  currentClient = client;
};

export const getCurrentClientManual = (): keyof typeof clientLogos => {
  return currentClient;
};

export const getCurrentClientLogo = () => {
  const client = getCurrentClient();
  return clientLogos[client];
};

export const getLogoByClient = (clientName: string) => {
  if (clientName && clientName in clientLogos) {
    return clientLogos[clientName as keyof typeof clientLogos];
  }
  return clientLogos[DEFAULT_CLIENT];
};

export const availableClients = Object.keys(clientLogos) as Array<keyof typeof clientLogos>;
