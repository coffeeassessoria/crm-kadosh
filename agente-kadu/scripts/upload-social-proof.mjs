/**
 * Script de upload das fotos de prova social para o Supabase Storage.
 *
 * Como usar:
 *   1. Salve as fotos das caçambas em:  agente-kadu/assets/social-proof/
 *      (formatos aceitos: .jpg, .jpeg, .png, .webp)
 *   2. Execute na pasta agente-kadu/:
 *        node scripts/upload-social-proof.mjs
 *   3. Copie a linha SOCIAL_PROOF_URLS=... gerada e cole no .env
 *   4. Reinicie o agente (docker compose up -d --build)
 */

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ASSETS_DIR = path.join(__dirname, '..', 'assets', 'social-proof');
const BUCKET = 'assets';
const FOLDER = 'social-proof';

const MIME = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
};

async function main() {
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceKey) {
    console.error('❌ SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY precisam estar no .env');
    process.exit(1);
  }

  if (!fs.existsSync(ASSETS_DIR)) {
    console.error(`❌ Pasta não encontrada: ${ASSETS_DIR}`);
    console.error('   Crie a pasta e coloque as fotos lá antes de rodar este script.');
    process.exit(1);
  }

  const supabase = createClient(supabaseUrl, serviceKey);

  // Garante que o bucket existe e é público
  const { error: bucketError } = await supabase.storage.createBucket(BUCKET, { public: true });
  if (bucketError && !bucketError.message.includes('already exists')) {
    console.error('❌ Erro ao criar bucket:', bucketError.message);
    process.exit(1);
  }

  const files = fs.readdirSync(ASSETS_DIR).filter((f) => MIME[path.extname(f).toLowerCase()]);

  if (files.length === 0) {
    console.error('❌ Nenhuma imagem encontrada em:', ASSETS_DIR);
    process.exit(1);
  }

  console.log(`📸 Enviando ${files.length} imagem(ns) para o Supabase Storage...\n`);
  const publicUrls = [];

  for (const file of files) {
    const ext = path.extname(file).toLowerCase();
    const mimeType = MIME[ext];
    const buffer = fs.readFileSync(path.join(ASSETS_DIR, file));
    const destPath = `${FOLDER}/${file}`;

    const { error } = await supabase.storage.from(BUCKET).upload(destPath, buffer, {
      contentType: mimeType,
      upsert: true,
    });

    if (error) {
      console.error(`  ❌ ${file}: ${error.message}`);
      continue;
    }

    const { data } = supabase.storage.from(BUCKET).getPublicUrl(destPath);
    console.log(`  ✅ ${file}`);
    console.log(`     ${data.publicUrl}\n`);
    publicUrls.push(data.publicUrl);
  }

  if (publicUrls.length === 0) {
    console.error('❌ Nenhuma imagem foi enviada com sucesso.');
    process.exit(1);
  }

  console.log('─'.repeat(60));
  console.log('✅ Upload concluído! Adicione ao arquivo .env:\n');
  console.log(`SOCIAL_PROOF_URLS=${publicUrls.join(',')}`);
  console.log('\nDepois execute: docker compose up -d --build');
}

main().catch((err) => {
  console.error('Erro inesperado:', err);
  process.exit(1);
});
