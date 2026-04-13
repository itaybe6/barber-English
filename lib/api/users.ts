import { supabase, User, getBusinessId } from '../supabase';
import { useAuthStore } from '../../stores/authStore';

/** Same matching idea as Edge `phoneDigits` / `userExistsForRegister`. */
function userPhoneMatchesRow(storedPhone: string, rawPhone: string): boolean {
  const trimmed = rawPhone.trim();
  const digits = trimmed.replace(/\D/g, '');
  const storedDigits = String(storedPhone || '').replace(/\D/g, '');
  return storedDigits === digits || String(storedPhone || '').trim() === trimmed;
}

/**
 * When several `users` rows share the same phone (and same demo hash), `.find` + password
 * on the first phone match can pick the wrong row. Prefer exact stored phone, then `client`.
 */
function pickUserWhenPhoneAndPasswordAmbiguous(matches: User[], trimmedPhone: string): User {
  if (matches.length === 1) return matches[0];

  const exactPhone = matches.filter((u) => String(u.phone || '').trim() === trimmedPhone);
  let pool = exactPhone.length > 0 ? exactPhone : matches;

  const clients = pool.filter(
    (u) => String((u as any).user_type || '').trim().toLowerCase() === 'client',
  );
  if (clients.length > 0) pool = clients;

  pool.sort((a, b) => String(a.id).localeCompare(String(b.id)));
  const chosen = pool[0];
  console.warn(
    '[usersApi] authenticateUserByPhone: multiple users matched phone+password for this business; picked',
    chosen?.id,
    (chosen as any)?.user_type,
    `(candidates=${matches.length})`,
  );
  return chosen;
}

export const usersApi = {
  // Simple hash function for passwords (for demo purposes)
  hashPassword(password: string): string {
    // In production, use a proper hashing library like bcrypt
    // For now, we'll use a simple approach
    return password === '123456' ? 'default_hash' : `hash_${password}`;
  },

  // Delete a specific user (by ID) and all related data across tables
  async deleteUserAndAllDataById(targetUserId: string): Promise<boolean> {
    try {
      const businessId = getBusinessId();

      // Helper to detect if a column exists on a table by probing a select
      const columnExists = async (table: string, column: string): Promise<boolean> => {
        try {
          const { error } = await supabase
            .from(table)
            .select(`id, ${column}` as any)
            .limit(1);
          return !error;
        } catch {
          return false;
        }
      };

      // 1) Delete appointments owned by or assigned to this user (handles FK on appointments.barber_id)
      {
        const { error: apptErr } = await supabase
          .from('appointments')
          .delete()
          .eq('business_id', businessId)
          .or(`user_id.eq.${targetUserId},barber_id.eq.${targetUserId}`);
        if (apptErr) {
          console.error('Failed to delete appointments for user:', apptErr);
          return false;
        }
      }

      // 2) Delete business constraints created by this user
      {
        const { error } = await supabase
          .from('business_constraints')
          .delete()
          .eq('user_id', targetUserId)
          .eq('business_id', businessId);
        if (error) {
          console.error('Failed to delete business_constraints for user:', error);
          return false;
        }
      }

      // 3) Delete business hours created for this user
      {
        const { error } = await supabase
          .from('business_hours')
          .delete()
          .eq('user_id', targetUserId)
          .eq('business_id', businessId);
        if (error) {
          console.error('Failed to delete business_hours for user:', error);
          return false;
        }
      }

      // 4) Delete designs created by this user
      {
        const { error } = await supabase
          .from('designs')
          .delete()
          .eq('user_id', targetUserId)
          .eq('business_id', businessId);
        if (error) {
          console.error('Failed to delete designs for user:', error);
          return false;
        }
      }

      // 5) Delete recurring appointments that reference this user (support user_id or admin_id column)
      {
        let deleted = false;
        if (await columnExists('recurring_appointments', 'user_id')) {
          const { error } = await supabase
            .from('recurring_appointments')
            .delete()
            .eq('business_id', businessId)
            .eq('user_id', targetUserId);
          if (!error) deleted = true; else console.warn('recurring_appointments delete by user_id failed:', error);
        }
        if (!deleted && (await columnExists('recurring_appointments', 'admin_id'))) {
          const { error } = await supabase
            .from('recurring_appointments')
            .delete()
            .eq('business_id', businessId)
            .eq('admin_id', targetUserId);
          if (error) {
            console.error('Failed to delete recurring_appointments for user:', error);
            return false;
          }
        }
      }

      // 6) Delete waitlist entries created by this user
      {
        const { error } = await supabase
          .from('waitlist_entries')
          .delete()
          .eq('user_id', targetUserId)
          .eq('business_id', businessId);
        if (error) {
          console.error('Failed to delete waitlist_entries for user:', error);
          return false;
        }
      }

      // 7) Finally delete the user
      {
        const { error } = await supabase
          .from('users')
          .delete()
          .eq('id', targetUserId)
          .eq('business_id', businessId);
        if (error) {
          console.error('Failed to delete user:', error);
          return false;
        }
      }

      return true;
    } catch (error) {
      console.error('Error deleting user and all data by id:', error);
      return false;
    }
  },


  // Get user by phone and password (for login)
  async authenticateUserByPhone(phone: string, password: string): Promise<User | null> {
    try {
      const businessId = getBusinessId();
      const trimmed = phone.trim();

      const { data, error } = await supabase
        .from('users')
        .select('*')
        .eq('business_id', businessId);

      if (error || !data?.length) {
        return null;
      }

      const hashedPassword = this.hashPassword(password);
      const phoneMatches = data.filter((u) => userPhoneMatchesRow(u.phone, trimmed));
      const passwordMatches = phoneMatches.filter((u) => hashedPassword === u.password_hash);
      if (passwordMatches.length === 0) {
        return null;
      }
      if (passwordMatches.length === 1) {
        return passwordMatches[0];
      }
      return pickUserWhenPhoneAndPasswordAmbiguous(passwordMatches, trimmed);
    } catch (error) {
      console.error('Error authenticating user by phone:', error);
      return null;
    }
  },

  /**
   * Whether a row in `users` exists for this tenant with the same phone (digits or exact trim).
   * `null` = could not read users (caller should fall back to Edge Function).
   */
  async hasUserWithPhoneForBusiness(phoneRaw: string): Promise<boolean | null> {
    try {
      const businessId = getBusinessId();
      const trimmed = phoneRaw.trim();
      const digits = trimmed.replace(/\D/g, '');
      if (digits.length < 9) return false;

      const { data, error } = await supabase
        .from('users')
        .select('phone')
        .eq('business_id', businessId);

      if (error) {
        console.error('hasUserWithPhoneForBusiness:', error);
        return null;
      }
      if (!data) return null;
      return data.some((u: { phone: string }) => userPhoneMatchesRow(u.phone, trimmed));
    } catch (e) {
      console.error('hasUserWithPhoneForBusiness:', e);
      return null;
    }
  },

  // Get user by ID
  async getUserById(id: string): Promise<User | null> {
    try {
      const businessId = getBusinessId();
      
      const { data, error } = await supabase
        .from('users')
        .select('*')
        .eq('id', id)
        .eq('business_id', businessId) // רק משתמשים מאותו business
        .maybeSingle();

      if (error) {
        console.error('Error fetching user:', error);
        return null;
      }

      return data;
    } catch (error) {
      console.error('Error fetching user:', error);
      return null;
    }
  },

  // Create new user
  async createUser(userData: Omit<User, 'id' | 'created_at' | 'updated_at'>): Promise<User | null> {
    try {
      const businessId = getBusinessId();
      
      // Add default password hash if not provided
      const userWithPassword = {
        ...userData,
        business_id: businessId, // הוספת business_id אוטומטית
        password_hash: userData.password_hash || this.hashPassword('123456')
      };

      const { data, error } = await supabase
        .from('users')
        .insert([userWithPassword])
        .select()
        .single();

      if (error) {
        console.error('Error creating user:', error);
        return null;
      }

      return data;
    } catch (error) {
      console.error('Error creating user:', error);
      return null;
    }
  },

  /**
   * Creates an admin (or other) user with a chosen password.
   * Returns structured result so callers can show DB/RLS errors instead of failing silently.
   */
  async createUserWithPassword(
    userData: Omit<User, 'id' | 'created_at' | 'updated_at'>,
    password: string
  ): Promise<{ ok: true; user: User } | { ok: false; error: string; code?: string }> {
    try {
      const businessId = getBusinessId();

      const userWithPassword = {
        ...userData,
        business_id: businessId,
        password_hash: this.hashPassword(password),
      };

      const { data, error } = await supabase.from('users').insert([userWithPassword]).select().single();

      if (error) {
        console.error('Error creating user with password:', error);
        const code = (error as { code?: string }).code;
        return {
          ok: false,
          error: error.message || 'insert_failed',
          code,
        };
      }

      if (!data) {
        return { ok: false, error: 'no_row_returned' };
      }

      return { ok: true, user: data as User };
    } catch (error) {
      console.error('Error creating user with password:', error);
      return {
        ok: false,
        error: error instanceof Error ? error.message : 'unknown_error',
      };
    }
  }
  ,
  // Update existing user
  async updateUser(id: string, updates: Partial<User> & { password?: string }): Promise<User | null> {
    try {
      const businessId = getBusinessId();
      const payload: any = { ...updates };
      delete payload.email;
      // If a plain password is provided, hash it before saving
      if ((updates as any)?.password) {
        payload.password_hash = this.hashPassword((updates as any).password);
        delete payload.password;
      }

      const { data, error } = await supabase
        .from('users')
        .update(payload)
        .eq('id', id)
        .eq('business_id', businessId) // רק משתמשים מאותו business
        .select('*')
        .single();

      if (error) {
        console.error('Error updating user:', error);
        return null;
      }

      return data as User;
    } catch (error) {
      console.error('Error updating user:', error);
      return null;
    }
  },

  /** Clients waiting for admin approval (client_approved = false) */
  async getPendingClients(): Promise<User[]> {
    try {
      const businessId = getBusinessId();
      const [{ data, error }, bookedRes] = await Promise.all([
        supabase
          .from('users')
          .select('*')
          .eq('user_type', 'client')
          .eq('business_id', businessId)
          .eq('client_approved', false)
          .order('created_at', { ascending: false }),
        supabase
          .from('appointments')
          .select('user_id')
          .eq('business_id', businessId)
          .eq('is_available', false)
          .not('user_id', 'is', null),
      ]);

      if (error) {
        console.error('Error fetching pending clients:', error);
        return [];
      }
      if (bookedRes.error) {
        console.error('Error fetching booked client ids for pending filter:', bookedRes.error);
      }

      const bookedIds = new Set<string>();
      for (const row of bookedRes.data || []) {
        const uid = (row as { user_id?: string | null }).user_id;
        if (uid) bookedIds.add(uid);
      }

      // Anyone with a booked appointment linked to their user id is an active client, not "registration pending"
      return (data || []).filter((u) => u.id && !bookedIds.has(u.id));
    } catch (e) {
      console.error('Error fetching pending clients:', e);
      return [];
    }
  },

  async approveClient(id: string): Promise<User | null> {
    return this.updateUser(id, { client_approved: true });
  },

  /**
   * After a successful booking with a logged-in client, ensure `client_approved` is true.
   * Heals inconsistent rows (e.g. approved in practice but still `false` in DB) so they do not
   * reappear under "pending new clients" for admins.
   */
  async ensureClientApprovedAfterBooking(clientUserId: string | null | undefined): Promise<void> {
    if (!clientUserId || typeof clientUserId !== 'string') return;
    try {
      const businessId = getBusinessId();
      const { error } = await supabase
        .from('users')
        .update({ client_approved: true })
        .eq('id', clientUserId)
        .eq('business_id', businessId)
        .eq('user_type', 'client');
      if (error) {
        console.error('ensureClientApprovedAfterBooking:', error);
      }
    } catch (e) {
      console.error('ensureClientApprovedAfterBooking:', e);
    }
  },

  // Get all admin users (barbers)
  async getAdminUsers(): Promise<User[]> {
    try {
      const businessId = getBusinessId();
      
      const { data, error } = await supabase
        .from('users')
        .select('*')
        .eq('user_type', 'admin')
        .eq('business_id', businessId) // רק משתמשים מאותו business
        .order('name');

      if (error) {
        console.error('Error fetching admin users:', error);
        return [];
      }

      return data || [];
    } catch (error) {
      console.error('Error fetching admin users:', error);
      return [];
    }
  },

  // Delete user by ID
  async deleteUser(id: string): Promise<boolean> {
    try {
      const businessId = getBusinessId();
      
      const { error } = await supabase
        .from('users')
        .delete()
        .eq('id', id)
        .eq('business_id', businessId); // רק משתמשים מאותו business

      if (error) {
        console.error('Error deleting user:', error);
        return false;
      }

      return true;
    } catch (error) {
      console.error('Error deleting user:', error);
      return false;
    }
  },

  // Delete current user and all associated data
  async deleteUserAndAllData(): Promise<boolean> {
    try {
      const businessId = getBusinessId();
      const currentUser = useAuthStore.getState().user;
      
      if (!currentUser) {
        console.error('No current user found');
        return false;
      }

      const userId = currentUser.id;

      // Helper to detect if a column exists on a table by probing a select
      const columnExists = async (table: string, column: string): Promise<boolean> => {
        try {
          const { error } = await supabase
            .from(table)
            .select(`id, ${column}` as any)
            .limit(1);
          return !error;
        } catch {
          return false;
        }
      };

      // 1) Delete appointments owned by or assigned to this user (handles FK on appointments.barber_id)
      {
        const { error: apptErr } = await supabase
          .from('appointments')
          .delete()
          .eq('business_id', businessId)
          .or(`user_id.eq.${userId},barber_id.eq.${userId}`);
        if (apptErr) {
          console.error('Failed to delete appointments for user:', apptErr);
          return false;
        }
      }

      // 2) Delete business constraints created by this user
      {
        const { error } = await supabase
          .from('business_constraints')
          .delete()
          .eq('user_id', userId)
          .eq('business_id', businessId);
        if (error) {
          console.error('Failed to delete business_constraints for user:', error);
          return false;
        }
      }

      // 3) Delete business hours created for this user
      {
        const { error } = await supabase
          .from('business_hours')
          .delete()
          .eq('user_id', userId)
          .eq('business_id', businessId);
        if (error) {
          console.error('Failed to delete business_hours for user:', error);
          return false;
        }
      }

      // 4) Delete designs created by this user
      {
        const { error } = await supabase
          .from('designs')
          .delete()
          .eq('user_id', userId)
          .eq('business_id', businessId);
        if (error) {
          console.error('Failed to delete designs for user:', error);
          return false;
        }
      }

      // 5) Delete notifications for this business (existing behavior)
      {
        const { error } = await supabase
          .from('notifications')
          .delete()
          .eq('business_id', businessId);
        if (error) {
          console.error('Failed to delete notifications for business:', error);
          return false;
        }
      }

      // 6) Delete recurring appointments that reference this user (support user_id or admin_id column)
      {
        let deleted = false;
        if (await columnExists('recurring_appointments', 'user_id')) {
          const { error } = await supabase
            .from('recurring_appointments')
            .delete()
            .eq('business_id', businessId)
            .eq('user_id', userId);
          if (!error) deleted = true; else console.warn('recurring_appointments delete by user_id failed:', error);
        }
        if (!deleted && (await columnExists('recurring_appointments', 'admin_id'))) {
          const { error } = await supabase
            .from('recurring_appointments')
            .delete()
            .eq('business_id', businessId)
            .eq('admin_id', userId);
          if (error) {
            console.error('Failed to delete recurring_appointments for user:', error);
            return false;
          }
        }
      }

      // 7) Delete waitlist entries created by this user
      {
        const { error } = await supabase
          .from('waitlist_entries')
          .delete()
          .eq('user_id', userId)
          .eq('business_id', businessId);
        if (error) {
          console.error('Failed to delete waitlist_entries for user:', error);
          return false;
        }
      }

      // 8) Finally delete the user
      {
        const { error } = await supabase
          .from('users')
          .delete()
          .eq('id', userId)
          .eq('business_id', businessId);
        if (error) {
          console.error('Failed to delete user:', error);
          return false;
        }
      }

      return true;
    } catch (error) {
      console.error('Error deleting user and all data:', error);
      return false;
    }
  }
};