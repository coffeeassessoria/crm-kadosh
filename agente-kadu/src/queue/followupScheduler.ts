import cron from 'node-cron';
import { env } from '../config/env';
import { logger } from '../lib/logger';
import { executarRotinaFollowUp } from '../services/followup.service';

/** A cada minuto, verifica leads em silêncio há 2min+ após uma mensagem do Kadu e dispara follow-up. */
export function startFollowUpScheduler(): void {
  cron.schedule(
    '* * * * *',
    async () => {
      try {
        await executarRotinaFollowUp();
      } catch (err) {
        logger.error({ err }, 'Falha na rotina de follow-up automático');
      }
    },
    { timezone: env.TIMEZONE },
  );

  logger.info('Agendador de follow-up automático iniciado (a cada minuto)');
}
