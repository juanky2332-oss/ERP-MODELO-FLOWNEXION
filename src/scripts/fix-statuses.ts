
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
// Use Service Role if available to bypass RLS, otherwise Anon
const supabase = createClient(supabaseUrl, supabaseKey)

async function fix() {
    console.log('Starting Status Fix...')

    // 1. PRESUPUESTOS
    const { data: presupuestos, error: pError } = await supabase
        .from('presupuestos')
        .select('*')
        .is('statuses', null)

    if (presupuestos) {
        console.log(`Fixing ${presupuestos.length} Presupuestos...`)
        for (const p of presupuestos) {
            let newStatuses: string[] = []
            if (p.estado) {
                newStatuses.push(p.estado.toLowerCase())
            } else {
                newStatuses.push('pendiente')
            }
            // Presupuestos also had 'Enviado' flag? No, it was a state 'Enviado' or 'Aceptado' etc in some versions, 
            // but in this user's DB it seems 'estado' is the main one. 
            // Checking logic: 'Pendiente', 'Traspasado', 'Enviado' were values of 'estado'.

            await supabase.from('presupuestos').update({ statuses: newStatuses }).eq('id', p.id)
        }
    }

    // 2. ALBARANES
    const { data: albaranes } = await supabase
        .from('albaranes')
        .select('*')
        .is('statuses', null)

    if (albaranes) {
        console.log(`Fixing ${albaranes.length} Albaranes...`)
        for (const a of albaranes) {
            let newStatuses: string[] = []
            if (a.estado_vida) {
                newStatuses.push(a.estado_vida.toLowerCase())
            } else {
                newStatuses.push('pendiente')
            }
            if (a.es_enviado) {
                newStatuses.push('enviado')
            }
            await supabase.from('albaranes').update({ statuses: newStatuses }).eq('id', a.id)
        }
    }

    // 3. FACTURAS
    const { data: facturas } = await supabase
        .from('facturas')
        .select('*')
        .is('statuses', null)

    if (facturas) {
        console.log(`Fixing ${facturas.length} Facturas...`)
        for (const f of facturas) {
            let newStatuses: string[] = []
            // Facturas: 'Pendiente', 'Pagada' in estado_vida.
            if (f.estado_vida) {
                newStatuses.push(f.estado_vida.toLowerCase())
            } else {
                newStatuses.push('pendiente')
            }
            // Facturas: 'es_enviado' or 'enviada'? The hooks check 'es_enviado'.
            if (f.es_enviado || f.enviada) {
                newStatuses.push('enviado')
            }
            await supabase.from('facturas').update({ statuses: newStatuses }).eq('id', f.id)
        }
    }

    console.log('Fix Complete.')
}

fix().catch(console.error)
