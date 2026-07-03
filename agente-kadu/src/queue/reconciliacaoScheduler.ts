import cron from 'node-cron';
import { env } from '../config/env';
import { logger } from '../lib/logger';
import { executarReconciliacaoDiaria } from '../services/reconciliacao.service';
import { hojeISO } from '../services/crm.service';

/** Agenda a reconciliação diária: revê as conversas do dia e propõe agendamentos que ficaram só no chat. */
export function startReconciliacaoScheduler(): void {
  cron.schedule(
    env.HORARIO_RECONCILIACAO_CRON,
    async () => {
      try {
        await executarReconciliacaoDiaria(hojeISO());
      } catch (err) {
        logger.error({ err }, 'Falha na reconciliação diária de agendamentos');
      }
    },
    { timezone: env.TIMEZONE },
  );

  logger.info(
    { cron: env.HORARIO_RECONCILIACAO_CRON, timezone: env.TIMEZONE },
    'Agendador de reconciliação diária iniciado',
  );
}
