import { query } from '../src/lib/db';
import { encryptApiKey } from '../src/lib/ai/encryption';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

async function main() {
  const enc = encryptApiKey(process.env.GROQ_API_KEY || '');
  await query(
    `UPDATE ai_provider_configs SET
      encrypted_api_key = ?,
      selected_model = 'openai/gpt-oss-120b',
      default_model = 'openai/gpt-oss-120b',
      last_connection_status = 'connected'
     WHERE provider = 'groq'`,
    [enc.encryptedPayload]
  );
  console.log('Successfully synced Groq model and encrypted key to MySQL!');
  process.exit(0);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
