import * as crm from './crm.service';
import * as calendar from './calendar.service';
import * as maps from './maps.service';

export interface DadosAgendamento {
  leadId: string;
  nomeCliente: string;
  telefone: string;
  enderecoCompleto: string;
  bairro: string;
  tipoResiduo: string;
  quantidadeCacambas: number;
  dataEntrega: string;
  horarioEntrega: string | null;
  diasPermanencia: number;
  valorTotal: number;
}

/**
 * Cria um agendamento completo: CRM (lead + agendamento + evento no calendário do CRM) e,
 * se configurado, o evento no Google Agenda. Usado tanto pelo agente de vendas
 * (create_appointment) quanto pelo agente administrativo (criar_agendamento e confirmação
 * de propostas de reconciliação) — mantém as três origens sempre consistentes.
 */
export async function criarAgendamentoCompleto(dados: DadosAgendamento) {
  const dataRetirada = crm.addDias(dados.dataEntrega, dados.diasPermanencia);

  await crm.updateLead(dados.leadId, {
    nome: dados.nomeCliente,
    tipo_residuo: dados.tipoResiduo,
    bairro: dados.bairro,
    endereco: dados.enderecoCompleto,
    quantidade_cacambas: dados.quantidadeCacambas,
    valor: dados.valorTotal,
    status: 'agendado',
    data_agendamento: dados.dataEntrega,
  });

  const agendamento = await crm.createAgendamento({
    lead_id: dados.leadId,
    endereco_completo: dados.enderecoCompleto,
    bairro: dados.bairro,
    tipo_residuo: dados.tipoResiduo,
    quantidade_cacambas: dados.quantidadeCacambas,
    data_entrega: dados.dataEntrega,
    horario_entrega: dados.horarioEntrega,
    data_retirada: dataRetirada,
    dias_permanencia: dados.diasPermanencia,
    valor_total: dados.valorTotal,
    status: 'confirmado',
  });

  await crm.createEventoAgendamento({
    leadId: dados.leadId,
    titulo: `🚛 Entrega - ${dados.nomeCliente} (${dados.quantidadeCacambas}x)`,
    descricao: [
      `Endereço: ${dados.enderecoCompleto}`,
      `Resíduo: ${dados.tipoResiduo}`,
      `Quantidade: ${dados.quantidadeCacambas} caçamba(s)`,
      `Valor total: R$ ${dados.valorTotal.toFixed(2)}`,
      `Retirada prevista: ${dataRetirada}`,
      `Telefone: ${dados.telefone}`,
    ].join('\n'),
    dataEvento: dados.dataEntrega,
    horaInicio: dados.horarioEntrega,
  });

  const googleEventId = await calendar.createDeliveryEvent({
    title: `Entrega - ${dados.nomeCliente}`,
    description: [
      `Cliente: ${dados.nomeCliente}`,
      `Telefone: ${dados.telefone}`,
      `Resíduo: ${dados.tipoResiduo}`,
      `Quantidade: ${dados.quantidadeCacambas} caçamba(s)`,
      `Valor total: R$ ${dados.valorTotal.toFixed(2)}`,
      `Retirada prevista: ${dataRetirada}`,
    ].join('\n'),
    location: dados.enderecoCompleto,
    date: dados.dataEntrega,
    time: dados.horarioEntrega,
  });

  if (googleEventId) {
    await crm.updateAgendamento(agendamento.id, { google_event_id: googleEventId });
  }

  await crm.addHistorico(
    dados.leadId,
    'agendamento',
    `Agendamento #${agendamento.numero_pedido ?? agendamento.id.slice(0, 8)} criado para ${dados.dataEntrega} (${dados.quantidadeCacambas}x, R$ ${dados.valorTotal.toFixed(2)}).`,
  );

  return {
    agendamento,
    dataRetirada,
    googleEventId,
    rota: maps.buildDirectionsLink(dados.enderecoCompleto),
  };
}
