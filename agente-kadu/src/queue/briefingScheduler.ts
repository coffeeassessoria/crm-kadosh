import cron from 'node-cron';
import { env } from '../config/env';
import { logger } from '../lib/logger';
import { sendDailyBriefing } from '../services/briefing.service';

/** RF05.1 — agenda o disparo diário do briefing operacional (padrão: 06h30, America/Cuiaba). */
export function startBriefingScheduler(): void {
  cron.schedule(
    env.HORARIO_BRIEFING_CRON,
    async () => {
      try {
        await sendDailyBriefing();
      } catch (err) {
        logger.error({ err }, 'Falha ao enviar briefing diário');
      }
    },
    { timezone: env.TIMEZONE },
  );

  logger.info(
    { cron: env.HORARIO_BRIEFING_CRON, timezone: env.TIMEZONE },
    'Agendador de briefing diário iniciado',
  );
}
