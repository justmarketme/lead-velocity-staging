import { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

interface AICallNotification {
  id: string;
  recipient_name: string;
  call_purpose: string;
  call_status: string;
  proposed_changes: unknown;
  changes_approved: boolean | null;
  created_at: string;
}

interface NotificationPreferences {
  ai_call_in_app: boolean;
  ai_call_sound: boolean;
}

// Create notification sound using Web Audio API
const playNotificationSound = () => {
  try {
    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    
    // Create a pleasant two-tone notification sound
    const playTone = (frequency: number, startTime: number, duration: number) => {
      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();
      
      oscillator.connect(gainNode);
      gainNode.connect(audioContext.destination);
      
      oscillator.frequency.value = frequency;
      oscillator.type = 'sine';
      
      gainNode.gain.setValueAtTime(0, startTime);
      gainNode.gain.linearRampToValueAtTime(0.3, startTime + 0.05);
      gainNode.gain.linearRampToValueAtTime(0, startTime + duration);
      
      oscillator.start(startTime);
      oscillator.stop(startTime + duration);
    };
    
    const now = audioContext.currentTime;
    playTone(880, now, 0.15); // A5
    playTone(1108.73, now + 0.15, 0.2); // C#6
    
    // Close audio context after sounds finish
    setTimeout(() => audioContext.close(), 500);
  } catch (error) {
    console.error('Error playing notification sound:', error);
  }
};

export function useAICallNotifications() {
  const [notifications, setNotifications] = useState<AICallNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [preferences, setPreferences] = useState<NotificationPreferences>({
    ai_call_in_app: true,
    ai_call_sound: true,
  });
  const previousCountRef = useRef<number>(0);
  const isInitialLoadRef = useRef(true);

  const fetchPreferences = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error } = await supabase
        .from('notification_preferences')
        .select('ai_call_in_app, ai_call_sound')
        .eq('user_id', user.id)
        .maybeSingle();

      if (error) throw error;

      if (data) {
        setPreferences({
          ai_call_in_app: data.ai_call_in_app,
          ai_call_sound: data.ai_call_sound,
        });
      }
    } catch (error) {
      console.error('Error fetching notification preferences:', error);
    }
  }, []);

  const fetchNotifications = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('ai_call_requests')
        .select('id, recipient_name, call_purpose, call_status, proposed_changes, changes_approved, created_at')
        .eq('call_status', 'completed')
        .not('proposed_changes', 'is', null)
        .is('changes_approved', null)
        .order('created_at', { ascending: false });

      if (error) throw error;
      
      const newNotifications = data || [];
      
      // Play sound if there are new notifications (not on initial load) and sound is enabled
      if (!isInitialLoadRef.current && preferences.ai_call_sound && newNotifications.length > previousCountRef.current) {
        playNotificationSound();
      }
      
      previousCountRef.current = newNotifications.length;
      isInitialLoadRef.current = false;
      setNotifications(newNotifications);
    } catch (error) {
      console.error('Error fetching AI call notifications:', error);
    } finally {
      setLoading(false);
    }
  }, [preferences.ai_call_sound]);

  useEffect(() => {
    fetchPreferences();
  }, [fetchPreferences]);

  useEffect(() => {
    fetchNotifications();

    // Subscribe to realtime updates
    const channel = supabase
      .channel('ai-call-notifications')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'ai_call_requests',
        },
        () => {
          fetchNotifications();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchNotifications]);

  // Filter notifications based on in-app preference
  const visibleNotifications = preferences.ai_call_in_app ? notifications : [];

  return {
    notifications: visibleNotifications,
    pendingCount: visibleNotifications.length,
    loading,
    refetch: fetchNotifications,
    preferences,
    refetchPreferences: fetchPreferences,
  };
}
