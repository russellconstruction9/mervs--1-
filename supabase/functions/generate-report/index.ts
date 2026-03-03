import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function formatDate(ts: number): string {
  return new Date(ts).toLocaleDateString('en-US', { year: 'numeric', month: '2-digit', day: '2-digit' });
}

function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
}

function calcHours(startTime: number, endTime: number | null): number {
  if (!endTime) return 0;
  return Math.round(((endTime - startTime) / (1000 * 60 * 60)) * 100) / 100;
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

    // Verify caller
    const userClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } }
    );
    const { data: { user }, error: authError } = await userClient.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: corsHeaders });
    }

    const url = new URL(req.url);
    const userId = url.searchParams.get('userId');
    const startDate = url.searchParams.get('startDate');
    const endDate = url.searchParams.get('endDate');
    const orgId = url.searchParams.get('orgId');

    if (!userId || !startDate || !endDate) {
      return new Response(JSON.stringify({ error: 'Missing userId, startDate, or endDate' }), { status: 400, headers: corsHeaders });
    }

    // Convert date strings to timestamps
    const startTs = new Date(startDate).getTime();
    const endTs = new Date(endDate).getTime() + (24 * 60 * 60 * 1000 - 1); // end of day

    const serviceClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Fetch user profile for rate
    const { data: profile } = await serviceClient
      .from('profiles')
      .select('name, rate')
      .eq('id', userId)
      .single();

    const userName = profile?.name ?? userId;
    const hourlyRate = parseFloat(profile?.rate ?? '0');

    // Fetch time entries for user in date range
    let query = serviceClient
      .from('time_entries')
      .select('*')
      .eq('user_id', userId)
      .gte('start_time', startTs)
      .lte('start_time', endTs)
      .eq('status', 'completed')
      .order('start_time', { ascending: true });

    if (orgId) query = query.eq('org_id', orgId);

    const { data: entries, error: entriesError } = await query;
    if (entriesError) throw entriesError;

    // Build CSV
    const rows: string[] = [
      `TaskPoint Pay Report — ${userName}`,
      `Period: ${startDate} to ${endDate}`,
      `Hourly Rate: $${hourlyRate.toFixed(2)}`,
      '',
      'Date,Day Start,Day End,Hours Worked,Job,Notes,Pay',
    ];

    let totalHours = 0;
    let totalPay = 0;

    for (const entry of entries ?? []) {
      const hours = calcHours(entry.start_time, entry.end_time);
      const pay = entry.total_pay ?? (hours * hourlyRate);
      totalHours += hours;
      totalPay += pay;

      rows.push([
        formatDate(entry.start_time),
        formatTime(entry.start_time),
        entry.end_time ? formatTime(entry.end_time) : 'Active',
        hours.toFixed(2),
        entry.job_name ?? '',
        (entry.notes ?? '').replace(/,/g, ';'),
        `$${pay.toFixed(2)}`,
      ].join(','));
    }

    rows.push('');
    rows.push(`,,Total Hours,${totalHours.toFixed(2)},,,Total Pay: $${totalPay.toFixed(2)}`);

    const csv = rows.join('\n');
    const filename = `taskpoint-report-${userName.replace(/\s+/g, '-').toLowerCase()}-${startDate}-${endDate}.csv`;

    return new Response(csv, {
      headers: {
        ...corsHeaders,
        'Content-Type': 'text/csv',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    });
  } catch (err) {
    console.error('generate-report error:', err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
