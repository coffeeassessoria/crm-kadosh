import crypto from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { env } from '../config/env';
import { logger } from '../lib/logger';

/**
 * Autentica o webhook da Evolution API por meio de um segredo na própria URL
 * (ex: /webhook/whatsapp/:secret), já que a Evolution API não assina os
 * webhooks com HMAC como a Meta Cloud API.
 */
export function verifyWebhookSecret(req: Request, res: Response, next: NextFunction): void {
  const provided = Buffer.from(req.params.secret ?? '');
  const expected = Buffer.from(env.WEBHOOK_SECRET);

  const valid = provided.length === expected.length && crypto.timingSafeEqual(provided, expected);

  if (!valid) {
    logger.warn('Webhook do WhatsApp recebido com segredo inválido na URL');
    res.sendStatus(401);
    return;
  }

  next();
}
