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

    // Verify the caller is an admin
    const { data: callerProfile } = await userClient
      .from('profiles')
      .select('role, org_id')
      .eq('id', user.id)
      .single();

    if (!callerProfile || callerProfile.role !== 'admin') {
      return new Response(JSON.stringify({ error: 'Forbidden: admin role required' }), { status: 403, headers: corsHeaders });
    }

    const { userId, newPassword } = await req.json();
    if (!userId || !newPassword) {
      return new Response(JSON.stringify({ error: 'Missing userId or newPassword' }), { status: 400, headers: corsHeaders });
    }

    if (newPassword.length < 6) {
      return new Response(JSON.stringify({ error: 'Password must be at least 6 characters' }), { status: 400, headers: corsHeaders });
    }

    // Create service role client for admin operations
    const serviceClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Verify target user is in same org as admin
    const { data: targetProfile } = await serviceClient
      .from('profiles')
      .select('org_id, name')
      .eq('id', userId)
      .single();

    if (!targetProfile) {
      return new Response(JSON.stringify({ error: 'User not found' }), { status: 404, headers: corsHeaders });
    }

    if (targetProfile.org_id !== callerProfile.org_id) {
      return new Response(JSON.stringify({ error: 'Forbidden: user not in your organization' }), { status: 403, headers: corsHeaders });
    }

    // Reset the user's password
    const { error: updateError } = await serviceClient.auth.admin.updateUserById(
      userId,
      { password: newPassword }
    );

    if (updateError) {
      console.error('Password update error:', updateError);
      return new Response(JSON.stringify({ error: 'Failed to reset password' }), { status: 500, headers: corsHeaders });
    }

    return new Response(
      JSON.stringify({ success: true, message: `Password reset for ${targetProfile.name}` }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (err) {
    console.error('Edge function error:', err);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: corsHeaders }
    );
  }
});
