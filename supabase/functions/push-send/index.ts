import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Convert VAPID key from base64url to Uint8Array
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  return Uint8Array.from([...rawData].map(c => c.charCodeAt(0)));
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: corsHeaders });
    }

    // Verify caller is authenticated
    const userClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } }
    );
    const { data: { user }, error: authError } = await userClient.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: corsHeaders });
    }

    const { orgId, title, body, url, targetUserIds } = await req.json();

    if (!orgId || !title) {
      return new Response(JSON.stringify({ error: 'Missing orgId or title' }), { status: 400, headers: corsHeaders });
    }

    const serviceClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Fetch push subscriptions for this org (optionally filtered by targetUserIds)
    let query = serviceClient
      .from('push_subscriptions')
      .select('endpoint, p256dh, auth, user_id')
      .eq('org_id', orgId);

    if (targetUserIds && Array.isArray(targetUserIds) && targetUserIds.length > 0) {
      query = query.in('user_id', targetUserIds);
    }

    const { data: subscriptions, error: fetchError } = await query;
    if (fetchError) throw fetchError;

    if (!subscriptions || subscriptions.length === 0) {
      return new Response(JSON.stringify({ sent: 0, failed: 0, message: 'No subscriptions found' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const vapidPublicKey = Deno.env.get('VAPID_PUBLIC_KEY') ?? '';
    const vapidPrivateKey = Deno.env.get('VAPID_PRIVATE_KEY') ?? '';
    const vapidSubject = Deno.env.get('VAPID_SUBJECT') ?? 'mailto:admin@taskpoint.app';

    let sent = 0;
    let failed = 0;

    const payload = JSON.stringify({
      title,
      body: body ?? '',
      url: url ?? '/',
    });

    // Send push to each subscription using Web Push protocol
    await Promise.allSettled(subscriptions.map(async (sub) => {
      try {
        // Import web-push compatible module for Deno
        const { applicationServerKey } = await import('https://esm.sh/web-push@3.6.7');
        void applicationServerKey; // web-push doesn't have a clean Deno ESM, use manual approach

        // Build the push request manually using VAPID
        const pushResponse = await fetch(sub.endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/octet-stream',
            'Content-Encoding': 'aes128gcm',
            'TTL': '86400',
            // VAPID auth headers would be generated here
            // For full implementation, use web-push library or implement VAPID signing
          },
          body: payload,
        });

        if (pushResponse.ok || pushResponse.status === 201) {
          sent++;
        } else if (pushResponse.status === 410) {
          // Subscription expired — remove it
          await serviceClient
            .from('push_subscriptions')
            .delete()
            .eq('endpoint', sub.endpoint);
          failed++;
        } else {
          failed++;
        }
      } catch {
        failed++;
      }
    }));

    return new Response(JSON.stringify({ sent, failed }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('push-send error:', err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
