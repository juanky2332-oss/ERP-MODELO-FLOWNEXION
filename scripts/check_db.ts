import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl!, supabaseKey!);

async function check() {
    const list = ['facturas', 'albaranes', 'presupuestos', 'contactos'];
    for (const table of list) {
        let { count, error } = await supabase.from(table).select('*', { count: 'exact', head: true });
        if (error) console.error(`Error checking ${table}:`, error.message);
        else console.log(`Table ${table} has ${count} rows`);
    }
}
check();
