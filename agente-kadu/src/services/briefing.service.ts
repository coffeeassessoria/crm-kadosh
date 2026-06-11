import { env } from '../config/env';
import { logger } from '../lib/logger';
import * as crm from './crm.service';
import * as whatsapp from './whatsapp.service';
import * as maps from './maps.service';
import type { AgendaItem } from '../types';

const DIAS_SEMANA = [
  'domingo',
  'segunda-feira',
  'terça-feira',
  'quarta-feira',
  'quinta-feira',
  'sexta-feira',
  'sábado',
];

function nomeCliente(item: AgendaItem): string {
  const leadInfo = Array.isArray(item.leads) ? item.leads[0] : item.leads;
  return leadInfo?.nome ?? 'Cliente';
}

function formatarEntrega(item: AgendaItem, ordem: number): string {
  return [
    `\n[${ordem}] ${item.horario_entrega ?? 'Horário a combinar'} — ${nomeCliente(item)}`,
    `   Endereço: ${item.endereco_completo}`,
    `   Caçambas: ${item.quantidade_cacambas} unidade(s) | ${item.tipo_residuo ?? 'não informado'}`,
    `   Rota: ${maps.buildDirectionsLink(item.endereco_completo)}`,
  ].join('\n');
}

function formatarRetirada(item: AgendaItem, ordem: number): string {
  return [
    `\n[${ordem}] ${item.horario_entrega ?? 'Horário a combinar'} — ${nomeCliente(item)}`,
    `   Endereço: ${item.endereco_completo}`,
    `   Rota: ${maps.buildDirectionsLink(item.endereco_completo)}`,
  ].join('\n');
}

/** RF05 — monta e envia o briefing operacional diário para o grupo do WhatsApp. */
export async function sendDailyBriefing(): Promise<void> {
  const agora = new Date();
  const dataISO = agora.toLocaleDateString('en-CA', { timeZone: env.TIMEZONE }); // YYYY-MM-DD
  const diaSemana = DIAS_SEMANA[agora.getDay()];
  const dataCompleta = agora.toLocaleDateString('pt-BR', {
    timeZone: env.TIMEZONE,
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  });

  const { entregas, retiradas } = await crm.getAgendaDoDia(dataISO);

  let texto = `Bom dia, equipe! ☀️ Aqui está a agenda de hoje, ${diaSemana}, ${dataCompleta}.\n\n`;

  texto += `*ENTREGAS DO DIA — ${entregas.length} no total*\n`;
  texto += entregas.length === 0
    ? '_Nenhuma entrega agendada para hoje._\n'
    : entregas.map((item, i) => formatarEntrega(item, i + 1)).join('\n');

  texto += `\n\n*RETIRADAS DO DIA — ${retiradas.length} no total*\n`;
  texto += retiradas.length === 0
    ? '_Nenhuma retirada agendada para hoje._\n'
    : retiradas.map((item, i) => formatarRetirada(item, i + 1)).join('\n');

  texto += '\n\nBom trabalho a todos! Qualquer alteração de última hora, me avisem aqui. 🚛';

  await whatsapp.sendTextMessage(env.WHATSAPP_GRUPO_OPERACIONAL_ID, texto);
  logger.info({ entregas: entregas.length, retiradas: retiradas.length }, 'Briefing diário enviado');
}
