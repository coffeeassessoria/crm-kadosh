import { Router } from 'express';
import { env } from '../config/env';
import { supabase } from '../lib/supabase';

export const healthRouter = Router();

/** RNF02.5 — expõe o status de cada integração para monitoramento. */
healthRouter.get('/health', async (_req, res) => {
  const integrations: Record<string, string> = {};

  try {
    const { error } = await supabase.from('configuracoes').select('chave').limit(1);
    integrations.crm = error ? `erro: ${error.message}` : 'ok';
  } catch (err) {
    integrations.crm = `erro: ${(err as Error).message}`;
  }

  integrations.whatsapp =
    env.EVOLUTION_API_URL && env.EVOLUTION_API_KEY && env.EVOLUTION_INSTANCE ? 'configurado' : 'nao_configurado';
  integrations.google_agenda =
    env.GOOGLE_SERVICE_ACCOUNT_EMAIL && env.GOOGLE_PRIVATE_KEY ? 'configurado' : 'nao_configurado';
  integrations.anthropic = env.ANTHROPIC_API_KEY ? 'configurado' : 'nao_configurado';
  integrations.transcricao_audio = env.OPENAI_API_KEY ? 'configurado' : 'nao_configurado';

  const healthy = integrations.crm === 'ok';

  res.status(healthy ? 200 : 503).json({
    status: healthy ? 'ok' : 'degraded',
    integrations,
    timestamp: new Date().toISOString(),
  });
});
