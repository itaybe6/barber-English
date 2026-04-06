import Constants from 'expo-constants';
import { CURRENT_CLIENT } from '../config/currentClient';

// Logo mapping — every path must exist (Metro resolves at bundle time).
export const clientLogos = {
  EliyaMoshe: require('../../branding/EliyaMoshe/logo.png'),
} as const;

const DEFAULT_CLIENT: keyof typeof clientLogos = 'EliyaMoshe';

export const getCurrentClient = (): keyof typeof clientLogos => {
  try {
    const fromExtra =
      Constants.expoConfig?.extra?.CLIENT || Constants.expoConfig?.extra?.client;

    if (fromExtra && fromExtra in clientLogos) {
      return fromExtra as keyof typeof clientLogos;
    }

    if (CURRENT_CLIENT && CURRENT_CLIENT in clientLogos) {
      return CURRENT_CLIENT as keyof typeof clientLogos;
    }

    const client = process.env.CLIENT;

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
