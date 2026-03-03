
import { supabase } from './supabaseClient';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY as string;

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i++) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export const subscribeUserToPush = async (userId: string, orgId?: string): Promise<boolean> => {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    console.log('Push messaging not supported');
    return false;
  }

  if (!VAPID_PUBLIC_KEY || VAPID_PUBLIC_KEY.includes('YOUR_VAPID')) {
    alert('Push notifications are not yet configured. Contact your system admin.');
    return false;
  }

  try {
    // Must be triggered by user gesture (required for iOS 16.4+)
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      alert('Permission denied. Enable notifications in your device settings.');
      return false;
    }

    const registration = await navigator.serviceWorker.ready;

    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
    });

    const subJSON = subscription.toJSON();

    // Send subscription to Supabase Edge Function for storage
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) return false;

    const res = await fetch(`${SUPABASE_URL}/functions/v1/push-subscribe`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({
        endpoint: subJSON.endpoint,
        p256dh: subJSON.keys?.p256dh,
        auth: subJSON.keys?.auth,
        userId,
        orgId,
        userAgent: navigator.userAgent,
      }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      console.error('Failed to save push subscription:', err);
      return false;
    }

    return true;
  } catch (e) {
    console.error('Failed to subscribe to push:', e);
    return false;
  }
};

// Trigger a push notification to the org (called from App.tsx on task/message events)
export const sendPushToOrg = async (orgId: string, title: string, body: string, url?: string, targetUserIds?: string[]): Promise<void> => {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) return;

  await fetch(`${SUPABASE_URL}/functions/v1/push-send`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${session.access_token}`,
    },
    body: JSON.stringify({ orgId, title, body, url, targetUserIds }),
  }).catch(console.error);
};
