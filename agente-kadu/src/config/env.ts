import 'dotenv/config';
import { z } from 'zod';

const envSchema = z.object({
  PORT: z.coerce.number().default(3000),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),

  // LLM
  GOOGLE_AI_API_KEY: z.string().min(1, 'GOOGLE_AI_API_KEY é obrigatória'),
  // Alias mantido pelo Google apontando pro modelo flash atual — evita quebrar quando uma
  // versão específica (ex: gemini-2.5-flash) for descontinuada. Ver incidente de 2026-07-09.
  GOOGLE_AI_MODEL: z.string().default('gemini-flash-latest'),

  // Transcrição de áudio (opcional)
  OPENAI_API_KEY: z.string().optional(),

  // Supabase (CRM existente)
  SUPABASE_URL: z.string().url(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),

  // WhatsApp (Evolution API)
  EVOLUTION_API_URL: z
    .string()
    .url()
    .transform((url) => url.replace(/\/+$/, '')),
  EVOLUTION_API_KEY: z.string().min(1),
  EVOLUTION_INSTANCE: z.string().min(1),
  // Segredo usado na URL do webhook para autenticar as chamadas da Evolution API
  WEBHOOK_SECRET: z.string().min(1),
  WHATSAPP_GRUPO_OPERACIONAL_ID: z.string().min(1),

  // Google Agenda (opcional — sem isso, agendamentos ficam só no CRM)
  GOOGLE_SERVICE_ACCOUNT_EMAIL: z.string().optional(),
  GOOGLE_PRIVATE_KEY: z.string().optional(),
  GOOGLE_CALENDAR_ID: z.string().default('primary'),

  // Regras de negócio (RNF03.3)
  // Tamanho total da frota de mini caçambas — usado para checar estoque real por período.
  FROTA_TOTAL_CACAMBAS: z.coerce.number().positive().default(10),
  PRECO_LOCACAO: z.coerce.number().positive().default(249),
  // Diária promocional aplicada quando a data de ENTREGA cai em um dos PROMO_DIAS_SEMANA.
  PRECO_LOCACAO_PROMOCIONAL: z.coerce.number().positive().default(199),
  // Dias da semana (abreviação em português, separados por vírgula) com diária promocional.
  PROMO_DIAS_SEMANA: z.string().default('terca,quarta'),
  // Valor cobrado por dia extra de permanência da caçamba (além do 1º dia, já incluso na diária).
  // Não muda com a promoção — vale o mesmo valor em qualquer dia da semana.
  DIARIA_ADICIONAL: z.coerce.number().nonnegative().default(15),
  CHAVE_PIX: z.string().default(''),
  HORARIO_BRIEFING_CRON: z.string().default('30 6 * * *'),
  // Horário da reconciliação diária (revisão das conversas do dia em busca de fechamentos
  // não registrados como agendamento) — padrão 21h, depois do horário comercial.
  HORARIO_RECONCILIACAO_CRON: z.string().default('0 21 * * *'),
  TIMEZONE: z.string().default('America/Cuiaba'),
  HORARIO_COMERCIAL_INICIO: z.string().default('07:00'),
  HORARIO_COMERCIAL_FIM: z.string().default('18:00'),

  // Agente administrativo/financeiro (grupo operacional do WhatsApp)
  AGENTE_ADMIN_NOME: z.string().default('Kadu Financeiro'),
  // Palavra-gatilho (case-insensitive, busca por palavra) que aciona o agente administrativo no grupo.
  AGENTE_ADMIN_TRIGGER: z.string().min(1).default('kadu'),

  // Prova social — URLs das fotos das caçambas (separadas por vírgula)
  SOCIAL_PROOF_URLS: z.string().optional(),

  // Segurança (RNF01.4)
  RATE_LIMIT_MAX_PER_MINUTE: z.coerce.number().positive().default(10),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('❌ Variáveis de ambiente inválidas:');
  console.error(JSON.stringify(parsed.error.flatten().fieldErrors, null, 2));
  process.exit(1);
}

export const env = parsed.data;
