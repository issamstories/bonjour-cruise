import { createClient } from '@supabase/supabase-js';

// Supabase project for Bonjour Cruise member accounts.
// The publishable key is designed to be exposed in the browser, all access is
// gated by Row Level Security policies defined in supabase/schema.sql.
const SUPABASE_URL = 'https://vohocnkgdktssztsbirl.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_mL_-T9LbQwo2DqAG73df2g_XBYK2Tex';

export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
