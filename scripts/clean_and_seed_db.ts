import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, '../.env.local') });
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl!, supabaseServiceRoleKey!);

async function cleanAndSeed() {
    console.log("🚀 Iniciando borrado forzado de la base de datos...");

    // Función ayudante para borrar y chequear errores
    async function deleteTable(table: string) {
        process.stdout.write(`Borrando ${table}... `);
        const { error, count } = await supabase.from(table).delete({ count: 'exact' }).neq('id', '00000000-0000-0000-0000-000000000000');
        if (error) {
            console.log(`❌ ERROR: ${error.message}`);
        } else {
            console.log(`✅ OK (${count} borrados)`);
        }
    }

    // El orden importa para las Foreign Keys:
    // 1. Facturas dependen de Albaranes, Presupuestos, Contactos
    await deleteTable('facturas');

    // 2. Albaranes dependen de Presupuestos, Contactos
    await deleteTable('albaranes');

    // 3. Presupuestos dependen de Contactos
    await deleteTable('presupuestos');

    // 4. Delete logs si existen
    await deleteTable('logs');

    // 5. Contactos no depende de nadie
    await deleteTable('contactos');

    console.log("🌱 Insertando 2 contactos de prueba para Flownexion...");
    const { error: seedError } = await supabase.from('contactos').insert([
        {
            razon_social: 'Empresa Prueba Flownexion A',
            cif: 'B12345678',
            direccion: 'Calle Innovación 10, Madrid',
            telefono: '600123456',
            email: 'contacto@empresapruebaA.com',
            observaciones: 'Contacto de prueba generado automáticamente'
        },
        {
            razon_social: 'Empresa Prueba Flownexion B',
            cif: 'A87654321',
            direccion: 'Avenida Tecnología 55, Barcelona',
            telefono: '600654321',
            email: 'info@empresapruebaB.com',
            observaciones: 'Contacto de prueba secundario'
        }
    ]);

    if (seedError) {
        console.error("❌ Error al insertar contactos de prueba:", seedError);
    } else {
        console.log("✅ Contactos de prueba insertados.");
    }

    console.log("🏁 Proceso completado.");
    process.exit(0);
}

cleanAndSeed();
