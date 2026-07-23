# Estratégia

> O que importa agora. Prioridades, metas, prazos.

## Fase

Operação estabelecida, crescimento travado por estoque. Foco em maximizar conversão e agendamento
dentro da capacidade atual de 10 caçambas.

## Prioridade principal

Otimizar o atendimento e a conversão de leads que chegam pelo WhatsApp — o agente Kadu já
tá rodando, mas há espaço pra melhorar o fluxo de qualificação e fechamento.

## Gargalo atual

Estoque de 10 caçambas. Nos picos de demanda, não consegue atender todos os pedidos.
Solução de longo prazo: ampliar a frota. O controle de disponibilidade em tempo real
(considerando quantidade pedida e sobreposição de dias de permanência) já foi
implementado no agente Kadu em 03/07/2026 — o que falta agora é aumentar a frota física.

## Pra tirar das costas

Atendimento ao cliente — já endereçado parcialmente pelo agente Kadu no WhatsApp.
Reconciliação diária automática implementada em 03/07/2026: o Kadu Financeiro revê as
conversas do dia e propõe (pra confirmação da equipe) agendamentos que fecharam no chat
mas não foram registrados no CRM. Corrigido em 09/07/2026: parava de duplicar agendamento
quando o cliente já tinha fechado por outro caminho antes da proposta ser confirmada.
Próximo passo: acompanhamento pós-entrega e retirada.

Redução de fricção na reserva implementada em 23/07/2026: removida a exigência de sinal via
PIX adiantado (travava fechamentos) e o CEP deixou de ser obrigatório (só ajuda a localizar
o endereço). Também criada uma rotina de follow-up automático — se o cliente fica 2min em
silêncio no meio da conversa, o Kadu manda um follow-up cordial pra tentar resgatar a venda.

## Próximas prioridades

1. Maximizar taxa de conversão dos leads que chegam via WhatsApp — rastreamento de origem
   de anúncio (Meta Ads "Clique para o WhatsApp") implementado em 09/07/2026: o Kadu já
   identifica automaticamente qual campanha/anúncio gerou o lead e popula isso no CRM.
   Ainda não testado contra um anúncio real — validar quando o primeiro lead vindo de
   anúncio chegar.
2. Controle de disponibilidade de caçambas em tempo real — concluído em 03/07/2026 (check_availability no agente Kadu)
3. Crescimento da frota quando o fluxo de caixa permitir

## O que pode esperar

Expansão para outras cidades, diversificação de serviços.
Consolidar as 2 VPS (agente Kadu em 76.13.164.112 + Evolution API em 31.97.23.228) numa
só, pra economizar — avaliado em 03/07/2026, tecnicamente viável (VPS do Kadu tem espaço
de sobra), mas adiado: exige reconectar o WhatsApp (risco de indisponibilidade) e ainda
não é urgente. Fazer num horário de baixo movimento, com o Adriano por perto pra escanear
o QR code de novo.
