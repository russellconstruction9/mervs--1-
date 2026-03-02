
import { GOOGLE_SCRIPT_URL } from '../constants';
import { PushSubscriptionData } from '../types';

// IMPORTANT: This key MUST be from Firebase Console -> Project Settings -> Cloud Messaging -> Web Push Certificates
// If you don't generate this, push notifications will NOT work on iOS/Safari.
// For testing/placeholder, we use a dummy string, but the user MUST update this.
const VAPID_PUBLIC_KEY = "YOUR_VAPID_PUBLIC_KEY_HERE_FROM_FIREBASE";

// Helper to convert VAPID key
function urlBase64ToUint8Array(base64String: string) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding)
    .replace(/\-/g, '+')
    .replace(/_/g, '/');

  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);

  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export const subscribeUserToPush = async (userId: string): Promise<boolean> => {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    console.log("Push messaging not supported");
    return false;
  }

  // 1. Check if VAPID key is configured
  if (!VAPID_PUBLIC_KEY || VAPID_PUBLIC_KEY.includes("YOUR_VAPID")) {
    alert("System Admin: VAPID Key missing in code. Notifications cannot be enabled.");
    return false;
  }

  try {
    // 2. Request Permission (Must be triggered by user click on iOS)
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      alert("Permission denied. You must enable notifications in system settings.");
      return false;
    }

    // 3. Get Registration
    const registration = await navigator.serviceWorker.ready;

    // 4. Subscribe
    const subscribeOptions = {
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY)
    };

    const subscription = await registration.pushManager.subscribe(subscribeOptions);
    
    // 5. Prepare data for backend
    const subJSON = JSON.parse(JSON.stringify(subscription));
    
    const pushData: PushSubscriptionData = {
        endpoint: subJSON.endpoint,
        keys: {
            p256dh: subJSON.keys.p256dh,
            auth: subJSON.keys.auth
        },
        userId: userId,
        userAgent: navigator.userAgent
    };

    // 6. Send to Apps Script
    if (GOOGLE_SCRIPT_URL) {
        await fetch(GOOGLE_SCRIPT_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'text/plain;charset=utf-8' },
            body: JSON.stringify({
                action: 'saveSubscription',
                data: pushData
            })
        });
    }
    
    return true;

  } catch (e) {
    console.error("Failed to subscribe to push", e);
    alert("Failed to enable notifications. See console.");
    return false;
  }
};
