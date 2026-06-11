import { createClient } from '@supabase/supabase-js';
import { env } from '../config/env';

/**
 * Cliente Supabase com a service role key: ignora RLS.
 * Usado pelo agente para ler/gravar leads, mensagens, agendamentos, etc.
 * NUNCA exponha esse cliente/chave ao frontend.
 */
export const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
