import { supabase, BusinessHours } from '../supabase';

export const businessHoursApi = {
  // Get all business hours
  async getAllBusinessHours(userId?: string): Promise<BusinessHours[]> {
    try {
      let query = supabase
        .from('business_hours')
        .select('*');

      if (userId) {
        query = query.eq('user_id', userId);
      }

      const { data, error } = await query.order('day_of_week');

      if (error) {
        console.error('Error fetching business hours:', error);
        throw error;
      }

      return data || [];
    } catch (error) {
      console.error('Error in getAllBusinessHours:', error);
      throw error;
    }
  },

  // Get business hours for a specific user (barber)
  async getBusinessHoursByUser(userId: string): Promise<BusinessHours[]> {
    return this.getAllBusinessHours(userId);
  },

  // Update slot duration for all days
  async updateAllSlotDuration(slotDurationMinutes: number): Promise<number> {
    try {
      const { data, error } = await supabase
        .from('business_hours')
        .update({ slot_duration_minutes: slotDurationMinutes })
        // PostgREST requires a WHERE clause for UPDATE; use full-range filter to target all rows
        .gte('day_of_week', 0)
        .lte('day_of_week', 6)
        .select('day_of_week');

      if (error) {
        console.error('Error updating slot duration for all days:', error);
        throw error;
      }

      return (data?.length as number) || 0;
    } catch (error) {
      console.error('Error in updateAllSlotDuration:', error);
      throw error;
    }
  },


  // Update business hours for a specific day and user (barber)
  async updateBusinessHours(dayOfWeek: number, businessHours: Partial<BusinessHours>, userId?: string): Promise<BusinessHours | null> {
    try {
      // Try to update an existing row first
      let query = supabase
        .from('business_hours')
        .update(businessHours)
        .eq('day_of_week', dayOfWeek);

      if (userId) {
        query = query.eq('user_id', userId);
      } else {
        query = query.is('user_id', null);
      }

      const { data, error } = await query
        .select()
        .maybeSingle();

      // If another error occurred (not the 0-rows for single), surface it
      if (error && (error as any)?.code !== 'PGRST116') {
        console.error('Error updating business hours:', error);
        throw error;
      }

      // If we updated an existing row, return it
      if (data) return data as BusinessHours;

      // No existing row for this day and user. Upsert a new one with sensible defaults
      const upsertRow: any = {
        day_of_week: dayOfWeek,
        user_id: userId || null,
        // Defaults align with UI initial values
        start_time: (businessHours as any)?.start_time || '09:00',
        end_time: (businessHours as any)?.end_time || '17:00',
        break_start_time: (businessHours as any)?.break_start_time ?? null,
        break_end_time: (businessHours as any)?.break_end_time ?? null,
        is_active: (businessHours as any)?.is_active ?? true,
        slot_duration_minutes: (businessHours as any)?.slot_duration_minutes ?? 60,
        breaks: (businessHours as any)?.breaks ?? [],
      };

      const { data: upserted, error: upsertError } = await supabase
        .from('business_hours')
        .upsert(upsertRow, { onConflict: 'day_of_week,user_id', ignoreDuplicates: false })
        .select()
        .single();

      if (upsertError) {
        console.error('Error upserting business hours:', upsertError);
        throw upsertError;
      }

      return upserted as BusinessHours;
    } catch (error) {
      console.error('Error in updateBusinessHours:', error);
      throw error;
    }
  },

  // Create or update business hours (upsert)
  async upsertBusinessHours(businessHours: Omit<BusinessHours, 'id' | 'created_at' | 'updated_at'>): Promise<BusinessHours | null> {
    try {
      const { data, error } = await supabase
        .from('business_hours')
        .upsert(businessHours, { 
          onConflict: 'day_of_week',
          ignoreDuplicates: false 
        })
        .select()
        .single();

      if (error) {
        console.error('Error upserting business hours:', error);
        throw error;
      }

      return data;
    } catch (error) {
      console.error('Error in upsertBusinessHours:', error);
      throw error;
    }
  },

  // Generate time slots based on business hours
  async generateTimeSlotsForDate(date: string, userId?: string): Promise<any[]> {
    try {
      // Helper: apply recurring appointments for a given date after slots exist
      const applyRecurringAssignments = async (targetDate: string) => {
        try {
          const dayOfWeek = new Date(targetDate).getDay();

          // Fetch approved recurring rules for this day
          const { data: rules, error: rulesError } = await supabase
            .from('recurring_appointments')
            .select('*')
            .eq('day_of_week', dayOfWeek);

          if (rulesError || !rules || rules.length === 0) {
            return;
          }

          // Filter by optional date range in code for simplicity
          const validRules = rules.filter((r: any) => {
            const startOk = !r.start_date || r.start_date <= targetDate;
            const endOk = !r.end_date || r.end_date >= targetDate;
            return startOk && endOk;
          });

          for (const rule of validRules) {
            // Find slot for the rule time
          const { data: slot } = await supabase
              .from('appointments')
              .select('id, is_available')
              .eq('slot_date', targetDate)
              .eq('slot_time', rule.slot_time)
              .maybeSingle();

            if (!slot || !slot.id || slot.is_available !== true) {
              // No slot or already booked
              continue;
            }

            // Try to book it for the recurring client (only if still available)
            await supabase
              .from('appointments')
              .update({
                is_available: false,
                client_name: rule.client_name,
                client_phone: rule.client_phone,
                service_name: rule.service_name,
              })
              .eq('id', slot.id)
              .eq('is_available', true);
          }
        } catch (e) {
          console.error('Error applying recurring assignments:', e);
        }
      };

      // Get day of week (0=Sunday, 1=Monday, etc.)
      const dayOfWeek = new Date(date).getDay();
      
      // Get business hours row for this day (for is_active + slot_duration)
      let query = supabase
        .from('business_hours')
        .select('*')
        .eq('day_of_week', dayOfWeek)
        .eq('is_active', true);

      if (userId) {
        query = query.eq('user_id', userId);
      } else {
        query = query.is('user_id', null);
      }

      const { data: businessHours, error: bhError } = await query.single();

      if (bhError || !businessHours) {
        // No business hours found for day
        let deleteQuery = supabase
          .from('appointments')
          .delete()
          .eq('slot_date', date)
          .eq('is_available', true);

        if (userId) {
          deleteQuery = deleteQuery.eq('user_id', userId);
        } else {
          deleteQuery = deleteQuery.is('user_id', null);
        }

        await deleteQuery;
        return [];
      }

      // First, delete only available (not booked) slots for this date and user
      // This allows us to recreate the schedule without affecting booked appointments
      let deleteQuery = supabase
        .from('appointments')
        .delete()
        .eq('slot_date', date)
        .eq('is_available', true);

      if (userId) {
        deleteQuery = deleteQuery.eq('user_id', userId);
      } else {
        deleteQuery = deleteQuery.is('user_id', null);
      }

      const { error: deleteError } = await deleteQuery;

      if (deleteError) {
        console.error('Error deleting available slots:', deleteError);
        // Continue anyway to try to create new slots
      }

      // Generate slots between start and end times using slot duration
      const slots: any[] = [];

      // duration in minutes (default 60)
      const slotDurationMinutes = businessHours.slot_duration_minutes && businessHours.slot_duration_minutes > 0
        ? businessHours.slot_duration_minutes
        : 60;

      // Build availability windows based on base working hours minus any defined breaks[] or single legacy break
      type Window = { start: string; end: string };
      const windows: Window[] = [];
      const start = businessHours.start_time;
      const end = businessHours.end_time;
      windows.push({ start, end });

      // subtract breaks if provided
      const breaks: Array<{ start_time: string; end_time: string }> = (businessHours as any).breaks || [];
      const singleBreak = (businessHours.break_start_time && businessHours.break_end_time)
        ? [{ start_time: businessHours.break_start_time, end_time: businessHours.break_end_time }]
        : [];
      const allBreaks = [...breaks, ...singleBreak];

      const subtractBreaks = (wins: Window[], brks: typeof allBreaks): Window[] => {
        let result = wins.slice();
        for (const b of brks) {
          const next: Window[] = [];
          for (const w of result) {
            // No overlap
            if (b.end_time <= w.start || b.start_time >= w.end) {
              next.push(w);
              continue;
            }
            // Overlap: split window to up to two parts
            if (w.start < b.start_time) {
              next.push({ start: w.start, end: b.start_time });
            }
            if (b.end_time < w.end) {
              next.push({ start: b.end_time, end: w.end });
            }
          }
          result = next;
        }
        // filter invalid windows
        return result.filter(w => w.start < w.end);
      };

      // Load date-specific constraints and subtract them too
      const { data: constraintsRows } = await supabase
        .from('business_constraints')
        .select('start_time, end_time')
        .eq('date', date)
        .order('start_time');

      const finalWindowsPreConstraints = subtractBreaks(windows, allBreaks);

      const subtractConstraints = (wins: Window[], cons: Array<{ start_time: string; end_time: string }>): Window[] => {
        let result = wins.slice();
        for (const c of cons || []) {
          const next: Window[] = [];
          for (const w of result) {
            if (c.end_time <= w.start || c.start_time >= w.end) {
              next.push(w);
              continue;
            }
            if (w.start < c.start_time) {
              next.push({ start: w.start, end: c.start_time });
            }
            if (c.end_time < w.end) {
              next.push({ start: c.end_time, end: w.end });
            }
          }
          result = next;
        }
        return result.filter(w => w.start < w.end);
      };

      const finalWindows = subtractConstraints(finalWindowsPreConstraints, (constraintsRows as any) || []);

      // Helper to add minutes to HH:MM string
      const addMinutes = (hhmm: string, minutes: number): string => {
        const [h, m] = hhmm.split(':').map((x) => parseInt(x, 10));
        const total = h * 60 + m + minutes;
        const hh = Math.floor(total / 60) % 24; // wrap at 24
        const mm = total % 60;
        return `${hh.toString().padStart(2, '0')}:${mm.toString().padStart(2, '0')}`;
      };

      const compareTimes = (a: string, b: string) => a.localeCompare(b);

      for (const win of finalWindows) {
        // Iterate from start to strictly before end
        let t = win.start;
        while (compareTimes(t, win.end) < 0) {
          const timeString = t;
          // Always stage the slot. Upsert below will ignore conflicts and keep booked slots untouched
          slots.push({
            slot_date: date,
            slot_time: timeString,
            is_available: true,
            client_name: null,
            client_phone: null,
            service_name: null,
            appointment_id: null,
            user_id: userId || null,
          });
          t = addMinutes(t, slotDurationMinutes);
        }
      }

      // Insert new slots into database (idempotent): ignore duplicates on unique (slot_date, slot_time)
      if (slots.length > 0) {
        const { error: insertError } = await supabase
          .from('appointments')
          .upsert(slots, { onConflict: 'slot_date,slot_time,user_id', ignoreDuplicates: true })
          .select();

        if (insertError) {
          console.error('Error inserting time slots:', insertError);
          throw insertError;
        }
      }

      // Apply recurring assignments after slots exist
      await applyRecurringAssignments(date);

      // Return final slots for the date and user
      let finalQuery = supabase
        .from('appointments')
        .select('*')
        .eq('slot_date', date);

      if (userId) {
        finalQuery = finalQuery.eq('user_id', userId);
      } else {
        finalQuery = finalQuery.is('user_id', null);
      }

      const { data: finalSlots, error: finalFetchError } = await finalQuery.order('slot_time');

      if (finalFetchError) {
        console.error('Error fetching final slots:', finalFetchError);
        return [];
      }

      return finalSlots || [];
    } catch (error) {
      console.error('Error in generateTimeSlotsForDate:', error);
      throw error;
    }
  },
};