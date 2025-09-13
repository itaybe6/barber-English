import { createClient } from '@supabase/supabase-js';
import Constants from 'expo-constants';

const extra = (Constants?.expoConfig as any)?.extra ?? {};

// טעינת משתני סביבה עם סדר עדיפויות ברור
const supabaseUrl =
  process.env.EXPO_PUBLIC_SUPABASE_URL ||     // עדיפות ראשונה - משתנה סביבה
  extra.EXPO_PUBLIC_SUPABASE_URL ||           // עדיפות שנייה - מ app.json
  extra.SUPABASE_URL ||                       // עדיפות שלישית - legacy
  undefined;

const supabaseAnonKey =
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || // עדיפות ראשונה - משתנה סביבה
  extra.EXPO_PUBLIC_SUPABASE_ANON_KEY ||       // עדיפות שנייה - מ app.json
  extra.SUPABASE_ANON_KEY ||                   // עדיפות שלישית - legacy
  undefined;

// טעינת BUSINESS_ID עם סדר עדיפויות ברור
const businessId =
  process.env.BUSINESS_ID ||                   // עדיפות ראשונה - משתנה סביבה
  extra.BUSINESS_ID ||                         // עדיפות שנייה - מ app.json
  undefined;

// הצגת מידע debug רק ב development
if (__DEV__) {
  console.log('[supabase] Configuration loaded:');
  console.log('- URL:', supabaseUrl ? 'SET' : 'MISSING');
  console.log('- Anon Key:', supabaseAnonKey ? 'SET' : 'MISSING');
  console.log('- Business ID:', businessId ? 'SET' : 'MISSING');
  console.log('- Source: Using environment variables');
}

// מניעת קריסות בזמן ייבוא במצב production
if (!supabaseUrl || !supabaseAnonKey) {
  const missingVars = [];
  if (!supabaseUrl) missingVars.push('EXPO_PUBLIC_SUPABASE_URL');
  if (!supabaseAnonKey) missingVars.push('EXPO_PUBLIC_SUPABASE_ANON_KEY');
  
  console.error(`[supabase] Missing configuration: ${missingVars.join(', ')}`);
  console.error('[supabase] Please set these environment variables in your .env file');
}

export const supabase = createClient(
  (supabaseUrl as string) || 'https://example.invalid',
  (supabaseAnonKey as string) || 'anon-key-missing',
  {
    auth: {
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
    },
  }
);

// Export business ID for use throughout the app
export const getBusinessId = (): string => {
  if (!businessId) {
    console.error('[supabase] BUSINESS_ID is not configured');
    throw new Error('Business ID is not configured. Please set BUSINESS_ID in your environment variables.');
  }
  return businessId;
};

// Types for our database tables
export interface User {
  id: string;
  name: string;
  user_type: 'admin' | 'client';
  phone: string;
  email?: string;
  password_hash?: string;
  image_url?: string;
  push_token?: string;
  business_id: string;
  created_at: string;
  updated_at: string;
}


export interface Service {
  id: string;
  name: string;
  price: number;
  // Optional in type; DB has default 60 when not provided
  duration_minutes?: number;
  image_url?: string;
  is_active: boolean;
  business_id: string;
  created_at: string;
  updated_at: string;
}

// ServiceCategory removed; categories are now static in constants/services.ts

export interface Design {
  id: string;
  name: string;
  image_url: string;
  // New: list of image URLs for designs with multiple images. First item should match image_url.
  image_urls?: string[];
  categories: string[];
  popularity: number;
  description?: string;
  price_modifier: number;
  is_featured: boolean;
  // New: user (barber) association - using existing users table
  user_id?: string | null;
  business_id: string;
  created_at: string;
  updated_at: string;
}


export interface Appointment {
  id: string;
  service_name: string;
  service_id?: string;
  user_id?: string;
  slot_date: string; // YYYY-MM-DD format
  slot_time: string; // HH:MM format
  is_available: boolean;
  client_name?: string;
  client_phone?: string;
  duration_minutes: number;
  appointment_id?: string;
  business_id: string;
  barber_id?: string;
  status: 'confirmed' | 'pending' | 'cancelled' | 'completed' | 'no_show';
  created_at: string;
  updated_at: string;
}


// Business Hours interface
export interface BusinessHours {
  id: string;
  day_of_week: number; // 0=Sunday, 1=Monday, ..., 6=Saturday
  start_time: string; // HH:MM format
  end_time: string; // HH:MM format
  break_start_time?: string; // HH:MM format, optional
  break_end_time?: string; // HH:MM format, optional
  is_active: boolean;
  // New: optional per-day slot duration in minutes (e.g., 15, 20, 30, 45, 60). If not set, defaults to 60
  slot_duration_minutes?: number;
  // New: multiple breaks stored as JSON array of { start_time, end_time }
  breaks?: Array<{ start_time: string; end_time: string }>;
  // New: user (barber) association - using existing users table
  user_id?: string | null;
  business_id: string;
  created_at: string;
  updated_at: string;
}


// Business constraints (date-specific unavailable windows)
export interface BusinessConstraint {
  id: string;
  date: string; // YYYY-MM-DD
  start_time: string; // HH:MM or HH:MM:SS
  end_time: string;   // HH:MM or HH:MM:SS
  reason?: string | null;
  business_id: string;
  created_at: string;
  updated_at: string;
}

// Waitlist interface
export interface WaitlistEntry {
  id: string;
  client_name: string;
  client_phone: string;
  service_name: string;
  requested_date: string; // YYYY-MM-DD format
  time_period: 'morning' | 'afternoon' | 'evening' | 'any'; // Preferred time period
  status: 'waiting' | 'contacted' | 'booked' | 'cancelled';
  // New: user (barber) association - using existing users table
  user_id?: string | null;
  business_id: string;
  created_at: string;
  updated_at: string;
}

// Notification interface
export interface Notification {
  id: string;
  title: string;
  content: string;
  type: 'appointment_reminder' | 'promotion' | 'general' | 'system';
  recipient_name: string;
  recipient_phone: string;
  business_id: string;
  created_at: string;
  is_read: boolean;
  read_at?: string;
  // Optional flag to indicate if a push was sent successfully
  push_sent?: boolean;
}

// Recurring appointments interface
export interface RecurringAppointment {
  id: string;
  service_name: string;
  day_of_week: number; // 0=Sunday, 1=Monday, ..., 6=Saturday
  time: string; // HH:MM format
  status: 'active' | 'inactive';
  business_id: string;
  created_at: string;
  updated_at: string;
}

// Business profile (single-row table storing social links and address)
export interface BusinessProfile {
  id: string;
  display_name?: string;
  address?: string;
  phone?: string;
  instagram_url?: string;
  facebook_url?: string;
  tiktok_url?: string;
  break_minutes?: number;
  created_at: string;
  updated_at: string;
}