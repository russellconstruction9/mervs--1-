import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: corsHeaders });
    }

    // Verify the caller is an authenticated admin
    const userClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: authError } = await userClient.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: corsHeaders });
    }

    const { data: callerProfile } = await userClient
      .from('profiles')
      .select('role, org_id')
      .eq('id', user.id)
      .single();

    if (!callerProfile || callerProfile.role !== 'admin') {
      return new Response(JSON.stringify({ error: 'Forbidden: admin role required' }), { status: 403, headers: corsHeaders });
    }

    const { name, pin, rate, orgId, orgSlug } = await req.json();

    if (!name || !pin || !orgId) {
      return new Response(JSON.stringify({ error: 'Missing required fields: name, pin, orgId' }), { status: 400, headers: corsHeaders });
    }

    // Ensure admin can only create users in their own org
    if (orgId !== callerProfile.org_id) {
      return new Response(JSON.stringify({ error: 'Forbidden: cannot create user in a different organization' }), { status: 403, headers: corsHeaders });
    }

    // Use service role to create user WITHOUT touching the admin's session
    const serviceClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const domain = orgSlug ? `${orgSlug}.taskpoint.local` : 'taskpoint.local';
    const email = `${name.trim().toLowerCase().replace(/\s+/g, '.')}@${domain}`;

    const { data: newUser, error: createError } = await serviceClient.auth.admin.createUser({
      email,
      password: pin,
      email_confirm: true, // skip email confirmation flow
      user_metadata: {
        name: name.trim(),
        rate: parseFloat(rate) || 0,
        role: 'user',
        org_id: orgId,
      },
    });

    if (createError || !newUser.user) {
      throw new Error(createError?.message || 'Failed to create user');
    }

    // Upsert profile to guarantee org_id and role are set correctly
    await serviceClient
      .from('profiles')
      .upsert({
        id: newUser.user.id,
        name: name.trim(),
        rate: parseFloat(rate) || 0,
        role: 'user',
        org_id: orgId,
      });

    return new Response(JSON.stringify({
      id: newUser.user.id,
      name: name.trim(),
      rate: rate ?? '0',
      role: 'user',
      orgId,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (err) {
    console.error('create-user error:', err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
