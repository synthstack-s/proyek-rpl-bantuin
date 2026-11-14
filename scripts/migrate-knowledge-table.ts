import { query } from '../src/lib/db';

async function migrateKnowledgeTable() {
  console.log('--- MIGRATING ai_knowledge_base TABLE ---');
  await query(`
    CREATE TABLE IF NOT EXISTS \`ai_knowledge_base\` (
      \`id\` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      \`slug\` VARCHAR(100) NOT NULL,
      \`title\` VARCHAR(200) NOT NULL,
      \`category\` ENUM(
        'application_overview',
        'feature_documentation',
        'module_documentation',
        'business_rules',
        'user_guide',
        'workflow_documentation',
        'role_permission_documentation',
        'database_relationship_documentation',
        'system_configuration_documentation',
        'error_handling_documentation'
      ) NOT NULL,
      \`tags\` JSON NULL DEFAULT NULL,
      \`summary\` TEXT NOT NULL,
      \`content\` MEDIUMTEXT NOT NULL,
      \`source\` VARCHAR(150) NOT NULL,
      \`is_active\` BOOLEAN NOT NULL DEFAULT TRUE,
      \`created_by_admin_id\` BIGINT UNSIGNED NULL DEFAULT NULL,
      \`created_at\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      \`updated_at\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (\`id\`),
      UNIQUE KEY \`uq_knowledge_slug\` (\`slug\`),
      INDEX \`idx_knowledge_category_active\` (\`category\`, \`is_active\`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Knowledge Base resmi asisten AI BANTUIN';
  `);
  console.log('✔ Table ai_knowledge_base created or already exists.');
}

migrateKnowledgeTable()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Migration error:', err);
    process.exit(1);
  });
