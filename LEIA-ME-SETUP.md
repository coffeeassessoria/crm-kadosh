# Kadosh CRM — Guia de Configuração

## 1. Supabase (Banco de Dados)

### 1.1 Criar projeto
1. Acesse https://supabase.com → Criar conta gratuita
2. Clique em **New project** → Nome: `kadosh-crm` → Gere uma senha forte → Crie

### 1.2 Rodar o schema SQL
1. No painel do Supabase: **SQL Editor** → **New query**
2. Cole todo o conteúdo do arquivo `SUPABASE_MIGRATION.sql`
3. Clique em **Run** ✓

### 1.3 Pegar as credenciais
1. Vá em **Settings → API**
2. Copie:
   - **Project URL** → `https://xxxx.supabase.co`
   - **anon / public key** → `eyJ...`

### 1.4 Configurar o CRM
Abra `CRM/config.js` e substitua:
```js
supabaseUrl:     'https://SEU_PROJETO.supabase.co',
supabaseAnonKey: 'SUA_CHAVE_ANONIMA_AQUI',
```

---

## 2. Criar o primeiro usuário (atendente)

1. No Supabase: **Authentication → Users → Add user**
2. Informe e-mail e senha do atendente
3. Marque **Auto Confirm User** ✓

Repita para cada atendente da equipe.

---

## 3. Deploy na Vercel

### 3.1 Subir para o GitHub
```bash
git init
git add -A
git commit -m "feat: Kadosh CRM inicial"
git remote add origin https://github.com/SEU_USUARIO/kadosh-crm.git
git push -u origin main
```

> ⚠️ O arquivo `CRM/config.js` está no `.gitignore` por segurança.
> Você vai configurar as credenciais na Vercel como variáveis de ambiente (passo 3.3).

### 3.2 Conectar à Vercel
1. Acesse https://vercel.com → **Add New Project**
2. Importe o repositório do GitHub
3. Clique em **Deploy**

### 3.3 Configurar credenciais na Vercel (opcional — para não expor no código)
Se quiser usar variáveis de ambiente:
1. Vercel → Projeto → **Settings → Environment Variables**
2. Adicione:
   - `SUPABASE_URL` = `https://xxxx.supabase.co`
   - `SUPABASE_ANON_KEY` = `eyJ...`

Para ler as vars no HTML estático, é necessário um edge function.
Por ora, manter o `config.js` localmente é suficiente para o MVP.

---

## 4. Integrar o site ao banco de dados

No Supabase, vá em **Settings → API** e copie o `anon key`.

No CRM → **Configurações → Integração com o Site**,
você verá o código pronto para colar no seu site.

Cole esse bloco antes do `</body>` no arquivo `kadosh-minicacambas-v6.html`.

---

## 5. Acessar o CRM

- **Site:** `https://seu-projeto.vercel.app/`
- **CRM:** `https://seu-projeto.vercel.app/crm`
- **Login:** `https://seu-projeto.vercel.app/crm/login`

---

## Estrutura de arquivos

```
KADOSH CRM/
├── SITE/
│   ├── kadosh-minicacambas-v6.html   ← Landing page
│   └── logo.png
├── CRM/
│   ├── index.html                    ← Dashboard CRM
│   ├── login.html                    ← Tela de login
│   └── config.js                     ← Credenciais Supabase (NÃO commitar)
├── SUPABASE_MIGRATION.sql            ← Rodar no Supabase 1x
├── vercel.json                       ← Configuração de rotas
├── .gitignore
└── LEIA-ME-SETUP.md
```
