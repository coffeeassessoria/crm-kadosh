import { google } from 'googleapis';
import { env } from '../config/env';
import { logger } from '../lib/logger';

interface CreateEventInput {
  title: string;
  description: string;
  /** Endereço completo — usado como localização do evento (RF03.2). */
  location: string;
  /** Data no formato YYYY-MM-DD */
  date: string;
  /** Horário no formato HH:MM (opcional, padrão 08:00) */
  time?: string | null;
}

function getCalendarClient() {
  if (!env.GOOGLE_SERVICE_ACCOUNT_EMAIL || !env.GOOGLE_PRIVATE_KEY) {
    return null;
  }

  const auth = new google.auth.JWT({
    email: env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
    key: env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'),
    scopes: ['https://www.googleapis.com/auth/calendar.events'],
  });

  return google.calendar({ version: 'v3', auth });
}

/**
 * RF03.2 — cria o evento de entrega no Google Agenda.
 * Retorna `null` (sem lançar erro) se a integração ainda não estiver configurada
 * (RNF01.2 — Service Account é opcional na fase inicial do esqueleto).
 */
export async function createDeliveryEvent(input: CreateEventInput): Promise<string | null> {
  const calendarClient = getCalendarClient();
  if (!calendarClient) {
    logger.warn('Google Agenda não configurado — agendamento criado apenas no CRM');
    return null;
  }

  const startTime = input.time ?? '08:00';
  const start = new Date(`${input.date}T${startTime}:00`);
  const end = new Date(start);
  end.setHours(end.getHours() + 1);

  try {
    const response = await calendarClient.events.insert({
      calendarId: env.GOOGLE_CALENDAR_ID,
      requestBody: {
        summary: input.title,
        description: input.description,
        location: input.location,
        start: { dateTime: start.toISOString(), timeZone: env.TIMEZONE },
        end: { dateTime: end.toISOString(), timeZone: env.TIMEZONE },
      },
    });

    return response.data.id ?? null;
  } catch (err) {
    logger.error({ err }, 'Falha ao criar evento no Google Agenda');
    return null;
  }
}
