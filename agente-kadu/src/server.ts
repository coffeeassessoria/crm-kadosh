import express from 'express';
import { env } from './config/env';
import { logger } from './lib/logger';
import { healthRouter } from './routes/health.routes';
import { whatsappRouter } from './routes/whatsapp.routes';
import { startBriefingScheduler } from './queue/briefingScheduler';
import { startReconciliacaoScheduler } from './queue/reconciliacaoScheduler';
import { startFollowUpScheduler } from './queue/followupScheduler';

const app = express();

app.use(express.json({ limit: '50mb' }));

app.use(healthRouter);
app.use(whatsappRouter);

app.listen(env.PORT, () => {
  logger.info(`Agente Kadu rodando na porta ${env.PORT}`);
  startBriefingScheduler();
  startReconciliacaoScheduler();
  startFollowUpScheduler();
});
