
import { createClient } from '@/lib/supabase/server' // We need server client for secure queries usually, or just client
import { supabase } from '@/lib/supabase'

export async function getNextSequenceNumber(type: 'presupuesto' | 'albaran' | 'factura' | 'gasto', customClient?: any): Promise<string> {
    const tableMap = {
        'presupuesto': 'presupuestos',
        'albaran': 'albaranes',
        'factura': 'facturas',
        'gasto': 'gastos'
    }

    const prefixMap = {
        'presupuesto': 'PREP',
        'albaran': 'ALB',
        'factura': 'FAC',
        'gasto': 'G'
    }

    const table = tableMap[type]
    const prefix = prefixMap[type]
    const year = new Date().getFullYear()

    // Use provide client or fallback to public client (public client might have lag or policies issues in server)
    const client = customClient || supabase

    // Search for documents of this year. Pattern: PREFIX-XX-2026...
    const { data, error } = await client
        .from(table)
        .select('numero')
        .ilike('numero', `${prefix}-%-${year}%`)
        .order('numero', { ascending: false })
        .limit(20) // Get more to be safe with alphanumeric sorting

    if (error) {
        console.error('Error fetching sequence:', error)
        throw new Error('Could not fetch sequence')
    }

    let maxSeq = 0

    if (data && data.length > 0) {
        // Regex to match the exact pattern: PREFIX-NUMBER-YEAR
        const regex = new RegExp(`^${prefix}-(\\d+)-${year}`)

        data.forEach((row: any) => {
            const match = row.numero.match(regex)
            if (match) {
                const seq = parseInt(match[1], 10)
                if (seq > maxSeq) {
                    maxSeq = seq
                }
            }
        })
    }

    const nextNum = maxSeq + 1
    const paddedNum = nextNum.toString().padStart(2, '0')
    return `${prefix}-${paddedNum}-${year}`
}
