/**
 * Utility functions for time formatting
 */

import i18n from '@/src/config/i18n';

type LocaleSettings = {
  locale: string;
  hour12: boolean;
  isHebrew: boolean;
};

const getLocaleSettings = (): LocaleSettings => {
  const lng = (i18n?.language || 'en').toLowerCase();
  const isHebrew = lng.startsWith('he');
  return {
    locale: isHebrew ? 'he-IL' : 'en-US',
    hour12: !isHebrew,
    isHebrew,
  };
};

const createDateFromTime = (timeString: string): Date | null => {
  if (!timeString) return null;
  const timeStr = String(timeString).trim();
  const parts = timeStr.split(':');
  if (parts.length < 2) return null;

  const hours = Number(parts[0]);
  const minutes = Number(parts[1]);
  const seconds = parts.length >= 3 ? Number(parts[2]) : 0;

  if (Number.isNaN(hours) || Number.isNaN(minutes) || Number.isNaN(seconds)) {
    return null;
  }

  const date = new Date();
  date.setHours(hours, minutes, seconds, 0);
  return date;
};

const formatDateWithLocale = (date: Date | null): string => {
  if (!date || Number.isNaN(date.getTime())) return '';
  const { locale, hour12 } = getLocaleSettings();
  try {
    return new Intl.DateTimeFormat(locale, {
      hour: '2-digit',
      minute: '2-digit',
      hour12,
    }).format(date).replace(/\s+/g, ' ').trim();
  } catch {
    return date.toLocaleTimeString(locale, {
      hour: '2-digit',
      minute: '2-digit',
      hour12,
    }).replace(/\s+/g, ' ').trim();
  }
};

/**
 * Formats a time string according to the current app locale.
 * - Hebrew → 24-hour clock (HH:MM)
 * - Others → 12-hour clock with AM/PM
 */
export const formatTime12Hour = (timeString: string): string => {
  if (!timeString) return '';
  const date = createDateFromTime(timeString);
  const formatted = formatDateWithLocale(date);
  return formatted || timeString;
};

export const formatTime12HourWithLeadingZero = (timeString: string): string => {
  return formatTime12Hour(timeString);
};

export const formatTimeFromDate = (date: Date): string => {
  return formatDateWithLocale(date) || '';
};

/**
 * Legacy export used across the app – now locale-aware.
 */
export const formatTime = formatTime12Hour;
