import { createClient, SupabaseClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

// Log config status for debugging (won't expose secrets)
console.log('[Supabase] URL configured:', !!supabaseUrl);
console.log('[Supabase] Key configured:', !!supabaseAnonKey);

// Create a dummy client that throws clear errors if config is missing
const createSafeClient = (): SupabaseClient => {
    if (!supabaseUrl || !supabaseAnonKey) {
        console.error('[Supabase] Missing environment variables. VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY must be set at build time.');
        // Return a proxy that throws helpful errors instead of crashing on import
        return new Proxy({} as SupabaseClient, {
            get(_, prop) {
                if (prop === 'auth' || prop === 'from' || prop === 'channel') {
                    return new Proxy(() => {}, {
                        get() {
                            return () => Promise.reject(new Error('Supabase not configured. Check Cloud Build substitutions.'));
                        },
                        apply() {
                            throw new Error('Supabase not configured. Check Cloud Build substitutions.');
                        }
                    });
                }
                return undefined;
            }
        });
    }
    return createClient(supabaseUrl, supabaseAnonKey);
};

export const supabase = createSafeClient();
