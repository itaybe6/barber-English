/**
 * Utility functions for time formatting
 */

/**
 * Converts 24-hour time format to 12-hour AM/PM format
 * @param timeString - Time in HH:MM or HH:MM:SS format
 * @returns Formatted time string in 12-hour format (e.g., "2:30 PM")
 */
export const formatTime12Hour = (timeString: string): string => {
  if (!timeString) return '';
  
  // Handle different time formats
  const timeStr = String(timeString).trim();
  
  // Extract hours and minutes
  let hours: number;
  let minutes: string;
  
  if (/^\d{1,2}:\d{2}$/.test(timeStr)) {
    // HH:MM format
    const [h, m] = timeStr.split(':');
    hours = parseInt(h, 10);
    minutes = m;
  } else if (/^\d{1,2}:\d{2}:\d{2}$/.test(timeStr)) {
    // HH:MM:SS format
    const [h, m] = timeStr.split(':');
    hours = parseInt(h, 10);
    minutes = m;
  } else {
    // Fallback: try to parse as before
    const parts = timeStr.split(':');
    if (parts.length >= 2) {
      hours = parseInt(parts[0], 10);
      minutes = parts[1];
    } else {
      return timeString; // Return original if can't parse
    }
  }
  
  // Convert to 12-hour format
  const period = hours >= 12 ? 'PM' : 'AM';
  const displayHours = hours === 0 ? 12 : hours > 12 ? hours - 12 : hours;
  
  return `${displayHours}:${minutes} ${period}`;
};

/**
 * Converts 24-hour time format to 12-hour AM/PM format with leading zero for hours
 * @param timeString - Time in HH:MM or HH:MM:SS format
 * @returns Formatted time string in 12-hour format (e.g., "02:30 PM")
 */
export const formatTime12HourWithLeadingZero = (timeString: string): string => {
  if (!timeString) return '';
  
  // Handle different time formats
  const timeStr = String(timeString).trim();
  
  // Extract hours and minutes
  let hours: number;
  let minutes: string;
  
  if (/^\d{1,2}:\d{2}$/.test(timeStr)) {
    // HH:MM format
    const [h, m] = timeStr.split(':');
    hours = parseInt(h, 10);
    minutes = m;
  } else if (/^\d{1,2}:\d{2}:\d{2}$/.test(timeStr)) {
    // HH:MM:SS format
    const [h, m] = timeStr.split(':');
    hours = parseInt(h, 10);
    minutes = m;
  } else {
    // Fallback: try to parse as before
    const parts = timeStr.split(':');
    if (parts.length >= 2) {
      hours = parseInt(parts[0], 10);
      minutes = parts[1];
    } else {
      return timeString; // Return original if can't parse
    }
  }
  
  // Convert to 12-hour format
  const period = hours >= 12 ? 'PM' : 'AM';
  const displayHours = hours === 0 ? 12 : hours > 12 ? hours - 12 : hours;
  
  return `${displayHours.toString().padStart(2, '0')}:${minutes} ${period}`;
};

/**
 * Legacy function for backward compatibility - now uses 12-hour format
 * @param timeString - Time in HH:MM or HH:MM:SS format
 * @returns Formatted time string in 12-hour format
 */
export const formatTime = formatTime12Hour;
