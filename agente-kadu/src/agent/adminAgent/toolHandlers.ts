import { env } from '../../config/env';
import { logger } from '../../lib/logger';
import * as crm from '../../services/crm.service';
import * as maps from '../../services/maps.service';
import type { AgendaItem } from '../../types';

/** Labels amigáveis das etapas do Kanban (ver SUPABASE_PATCH_03.sql, configuracoes.kanban_stages). */
const KANBAN_LABELS: Record<string, string> = {
  novo: 'Novo',
  contato: 'Em Contato',
  agendado: 'Agendado',
  sinal_pendente: 'Sinal Pendente',
  escalado: 'Escalado',
  convertido: 'Convertido',
  perdido: 'Perdido',
};

function hojeISO(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: env.TIMEZONE });
}

function addDiasISO(dataISO: string, dias: number): string {
  const data = new Date(`${dataISO}T00:00:00`);
  data.setDate(data.getDate() + dias);
  return data.toISOString().slice(0, 10);
}

/** Primeiro e último dia do mês corrente (no fuso da empresa), no formato YYYY-MM-DD. */
function inicioFimMes(): { inicio: string; fim: string } {
  const [ano, mes] = hojeISO().split('-').map(Number);
  const inicio = `${ano}-${String(mes).padStart(2, '0')}-01`;
  const ultimoDia = new Date(ano, mes, 0).getDate();
  const fim = `${ano}-${String(mes).padStart(2, '0')}-${String(ultimoDia).padStart(2, '0')}`;
  return { inicio, fim };
}

function comRota(item: AgendaItem) {
  return { ...item, rota: maps.buildDirectionsLink(item.endereco_completo) };
}

/** Executa uma tool do agente administrativo/financeiro e retorna o resultado (serializado para o Claude). */
export async function runAdminTool(name: string, input: Record<string, unknown>): Promise<unknown> {
  logger.info({ tool: name, input }, 'Executando tool do agente administrativo');

  switch (name) {
    case 'get_agenda': {
      const periodo = String(input.periodo ?? 'hoje');
      const hoje = hojeISO();

      const resultado =
        periodo === 'amanha'
          ? await crm.getAgendaDoDia(addDiasISO(hoje, 1))
          : periodo === 'semana'
            ? await crm.getAgendaPeriodo(hoje, addDiasISO(hoje, 6))
            : await crm.getAgendaDoDia(hoje);

      return {
        entregas: resultado.entregas.map(comRota),
        retiradas: resultado.retiradas.map(comRota),
      };
    }

    case 'get_resumo_financeiro': {
      const periodo = String(input.periodo ?? 'mes');
      const hoje = hojeISO();

      let dataInicio = hoje;
      let dataFim = hoje;

      if (periodo === 'semana') {
        dataFim = addDiasISO(hoje, 6);
      } else if (periodo === 'mes') {
        ({ inicio: dataInicio, fim: dataFim } = inicioFimMes());
      }

      return crm.getResumoFinanceiro(dataInicio, dataFim);
    }

    case 'get_funil_leads': {
      const funil = await crm.getFunilLeads();
      const total = funil.reduce((soma, item) => soma + item.total, 0);

      return {
        total,
        etapas: funil.map((item) => ({
          status: item.status,
          label: KANBAN_LABELS[item.status] ?? item.status,
          total: item.total,
        })),
      };
    }

    default:
      logger.warn({ tool: name }, 'Tool desconhecida solicitada pelo agente administrativo');
      return { erro: `Tool desconhecida: ${name}` };
  }
}
