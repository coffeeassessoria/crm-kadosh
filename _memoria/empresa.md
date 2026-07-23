# Empresa

> Memória central do negócio. O Claude lê esse arquivo antes de cada resposta.

**Nome:** Kadosh Mini Caçambas
**Site:** https://kadoshminicacambas.com.br
**Negócio:** Locação de mini caçambas para descarte de entulho
**O que faz:** Aluga mini caçambas para descarte de entulho doméstico e resíduos de pequenas obras. Inclui entrega, permanência e retirada. Atende toda a cidade de Sinop-MT.
**Perfil:** Dona de casa que limpou o quintal ou fez reforma. Pedreiro ou empreiteiro de pequenas obras que precisa descartar entulho rápido e sem burocracia.
**Atende clientes:** Sinop, Mato Grosso
**Equipe:** Operação solo — o dono, Adriano da Luz, toca tudo. Atendimento ao cliente via WhatsApp feito pelo agente de IA Kadu (66) 9 9658-5048.
**Ferramentas:** WhatsApp (Evolution API + IA Kadu, rodando em Google Gemini Flash), CRM próprio (Supabase), Google Calendar
**Infraestrutura:** agente Kadu roda em Docker numa VPS (76.13.164.112, deploy automático via GitHub Actions no push pra master). Evolution API roda em VPS separada (31.97.23.228, evo.coffeeassessoria.com.br) — duas VPS por enquanto (ver estratégia).
**Principais entregas:** Locação de mini caçamba com entrega e retirada no mesmo dia ou conforme agendamento

## Estoque e preços

- 10 mini caçambas disponíveis
- R$ 249 por caçamba (entrega + 1 dia de permanência + retirada)
- Promoção: R$ 199 quando a data de ENTREGA cair numa terça ou quarta-feira (confirmado por Adriano da Luz em 03/07/2026)
- R$ 15 por dia adicional de permanência por caçamba (não entra na promoção)

## Canais

- WhatsApp: (66) 9 9658-5048
- Instagram: @kadoshminicacambas
- Site: kadoshminicacambas.com.br

## Contexto adicional

Tagline da marca: "A solução para seu entulho."
Principal gargalo operacional: estoque limitado de 10 caçambas — nos picos de demanda, não consegue atender todos os pedidos.

Além do atendimento a leads, o Kadu tem um segundo agente ("Kadu Financeiro") que responde
no grupo operacional do WhatsApp com consultas de agenda, financeiro e funil de leads. Se o
agente falhar ao responder um lead (ex: API do Gemini fora do ar), o grupo operacional recebe
um alerta automático.

Desde 23/07/2026, o Kadu não cobra mais sinal via PIX adiantado pra reservar (estava
travando fechamentos) e não exige CEP do cliente pra fechar o agendamento (é só dado de
apoio pra achar o endereço). Também passou a fazer um follow-up automático e cordial quando
o cliente fica 2min em silêncio no meio da conversa, pra tentar resgatar a venda sem ser
insistente.
