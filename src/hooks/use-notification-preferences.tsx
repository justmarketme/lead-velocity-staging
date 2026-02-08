import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface NotificationPreferences {
  ai_call_email: boolean;
  ai_call_in_app: boolean;
  ai_call_sound: boolean;
}

const defaultPreferences: NotificationPreferences = {
  ai_call_email: true,
  ai_call_in_app: true,
  ai_call_sound: true,
};

export function useNotificationPreferences() {
  const [preferences, setPreferences] = useState<NotificationPreferences>(defaultPreferences);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const fetchPreferences = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error } = await supabase
        .from('notification_preferences')
        .select('ai_call_email, ai_call_in_app, ai_call_sound')
        .eq('user_id', user.id)
        .maybeSingle();

      if (error) throw error;

      if (data) {
        setPreferences({
          ai_call_email: data.ai_call_email,
          ai_call_in_app: data.ai_call_in_app,
          ai_call_sound: data.ai_call_sound,
        });
      }
    } catch (error) {
      console.error('Error fetching notification preferences:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPreferences();
  }, [fetchPreferences]);

  const updatePreferences = useCallback(async (updates: Partial<NotificationPreferences>) => {
    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const newPreferences = { ...preferences, ...updates };

      const { error } = await supabase
        .from('notification_preferences')
        .upsert({
          user_id: user.id,
          ...newPreferences,
        }, {
          onConflict: 'user_id',
        });

      if (error) throw error;

      setPreferences(newPreferences);
      toast.success('Notification preferences updated');
    } catch (error) {
      console.error('Error updating notification preferences:', error);
      toast.error('Failed to update preferences');
    } finally {
      setSaving(false);
    }
  }, [preferences]);

  return {
    preferences,
    loading,
    saving,
    updatePreferences,
    refetch: fetchPreferences,
  };
}
