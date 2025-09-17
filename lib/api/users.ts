import { supabase, User, getBusinessId } from '../supabase';
import { useAuthStore } from '../../stores/authStore';

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
      
      const { data, error } = await supabase
        .from('users')
        .select('*')
        .eq('phone', phone)
        .eq('business_id', businessId) // רק משתמשים מאותו business
        .single();

      if (error || !data) {
        return null;
      }

      // בדיקת סיסמה
      const hashedPassword = this.hashPassword(password);
      if (hashedPassword === data.password_hash) {
        // if blocked user, still return (caller decides), but include flag
        return data;
      }

      return null;
    } catch (error) {
      console.error('Error authenticating user by phone:', error);
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
        .single();

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
  async createUser(userData: Omit<User, 'id' | 'created_at' | 'updated_at'> & { email?: string }): Promise<User | null> {
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

  // Create new user with password
  async createUserWithPassword(userData: Omit<User, 'id' | 'created_at' | 'updated_at'> & { email?: string }, password: string): Promise<User | null> {
    try {
      const businessId = getBusinessId();
      
      const userWithPassword = {
        ...userData,
        business_id: businessId, // הוספת business_id אוטומטית
        password_hash: this.hashPassword(password)
      };

      const { data, error } = await supabase
        .from('users')
        .insert([userWithPassword])
        .select()
        .single();

      if (error) {
        console.error('Error creating user with password:', error);
        return null;
      }

      return data;
    } catch (error) {
      console.error('Error creating user with password:', error);
      return null;
    }
  }
  ,
  // Update existing user
  async updateUser(id: string, updates: Partial<User> & { password?: string }): Promise<User | null> {
    try {
      const businessId = getBusinessId();
      const payload: any = { ...updates };
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