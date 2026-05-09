#!/usr/bin/env node
import { Pool } from "pg";
import * as dotenv from "dotenv";

dotenv.config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function countItems() {
  try {
    const { rows: items } = await pool.query('SELECT COUNT(*) as total FROM delivery_menu_items');
    const { rows: cats } = await pool.query('SELECT COUNT(*) as total FROM delivery_menu_categories');
    const { rows: configs } = await pool.query('SELECT COUNT(*) as total FROM delivery_config');

    console.log('\n📊 Totais no banco:\n');
    console.log(`   delivery_menu_items: ${items[0].total}`);
    console.log(`   delivery_menu_categories: ${cats[0].total}`);
    console.log(`   delivery_config: ${configs[0].total}\n`);

    if (parseInt(items[0].total) > 0) {
      const { rows: allItems } = await pool.query('SELECT name, price, category_id FROM delivery_menu_items LIMIT 10');
      console.log('📦 Itens encontrados:\n');
      allItems.forEach(i => console.log(`   - ${i.name} (R$ ${i.price}) - Cat ID: ${i.category_id || 'N/A'}`));
    } else {
      console.log('⚠️  Nenhum item no banco! O produto criado pela interface NÃO foi salvo!');
    }

  } catch (error) {
    console.error('❌ Erro:', error);
  } finally {
    await pool.end();
  }
}

countItems().then(() => process.exit(0));
