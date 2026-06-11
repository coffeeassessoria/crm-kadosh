import { Router } from 'express';
import { logger } from '../lib/logger';
import { handleIncomingMessage, handleHumanTakeover } from '../agent';
import { handleAdminGroupMessage } from '../agent/adminAgent';
import { isWithinRateLimit } from '../middleware/rateLimiter';
import { verifyWebhookSecret } from '../middleware/verifyWebhookSecret';
import { parseIncomingMessages } from '../services/whatsapp.service';
import { env } from '../config/env';

export const whatsappRouter = Router();

/** RF01.1 — recebe eventos da Evolution API e aciona o agente Kadu para novas mensagens. */
whatsappRouter.post('/webhook/whatsapp/:secret', verifyWebhookSecret, (req, res) => {
  // Responde imediatamente (RNF02.1) para a Evolution API não reenviar o webhook.
  res.sendStatus(200);

  if (env.NODE_ENV === 'development') {
    logger.debug({ body: req.body }, 'Webhook recebido da Evolution API');
  }

  const messages = parseIncomingMessages(req.body);

  for (const message of messages) {
    if (message.isGroup) {
      // Mensagens do agente administrativo voltam como fromMe: true — descarta para evitar loop.
      if (message.fromMe) continue;

      handleAdminGroupMessage(message).catch((err) => {
        logger.error({ err, groupJid: message.groupJid }, 'Erro ao processar mensagem do grupo administrativo');
      });
      continue;
    }

    if (message.fromMe) {
      handleHumanTakeover(message).catch((err) => {
        logger.error({ err, from: message.from }, 'Erro ao processar atendimento humano');
      });
      continue;
    }

    if (!isWithinRateLimit(message.from)) {
      logger.warn({ from: message.from }, 'Rate limit excedido — mensagem ignorada');
      continue;
    }

    handleIncomingMessage(message).catch((err) => {
      logger.error({ err, from: message.from }, 'Erro ao processar mensagem do agente');
    });
  }
});
