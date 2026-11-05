import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

async function inspect() {
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST || '127.0.0.1',
    port: Number(process.env.DB_PORT) || 3306,
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'bantuin_db',
  });

  console.log('=== SERVICES COLUMNS ===');
  const [cols]: any = await conn.execute('SHOW FULL COLUMNS FROM services');
  for (const c of cols) {
    console.log(`${c.Field}: ${c.Type} | Null: ${c.Null} | Key: ${c.Key} | Default: ${c.Default} | Comment: ${c.Comment}`);
  }

  console.log('\n=== SERVICES INDEXES ===');
  const [indexes]: any = await conn.execute('SHOW INDEX FROM services');
  for (const idx of indexes) {
    console.log(`${idx.Key_name} (${idx.Column_name}) | Non_unique: ${idx.Non_unique}`);
  }

  console.log('\n=== APPLIANCE_CATEGORIES COLUMNS ===');
  const [catCols]: any = await conn.execute('SHOW FULL COLUMNS FROM appliance_categories');
  for (const c of catCols) {
    console.log(`${c.Field}: ${c.Type} | Null: ${c.Null} | Key: ${c.Key} | Default: ${c.Default}`);
  }

  console.log('\n=== FOREIGN KEYS REFERENCING SERVICES ===');
  const [fks]: any = await conn.execute(
    `SELECT TABLE_NAME, COLUMN_NAME, CONSTRAINT_NAME, REFERENCED_TABLE_NAME, REFERENCED_COLUMN_NAME
     FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE
     WHERE REFERENCED_TABLE_NAME = 'services' AND TABLE_SCHEMA = 'bantuin_db'`
  );

  for (const fk of fks) {
    console.log(`${fk.TABLE_NAME}.${fk.COLUMN_NAME} -> ${fk.REFERENCED_TABLE_NAME}.${fk.REFERENCED_COLUMN_NAME} (${fk.CONSTRAINT_NAME})`);
  }

  console.log('\n=== CURRENT SERVICES DATA (FIRST 5) ===');
  const [services]: any = await conn.execute(
    `SELECT s.id, s.category_id, c.name as category_name, s.name, s.slug, s.base_price, s.estimated_duration_min, s.is_active
     FROM services s
     JOIN appliance_categories c ON c.id = s.category_id
     ORDER BY s.id ASC LIMIT 5`
  );
  console.table(services);

  await conn.end();
}

inspect().catch(console.error);