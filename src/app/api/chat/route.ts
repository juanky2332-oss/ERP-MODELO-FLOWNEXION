
import { OpenAI } from "openai"
import { createClient } from "@/lib/supabase/server"
import { NextResponse } from "next/server"
import { startOfMonth, endOfMonth, subMonths } from "date-fns"

// Initialize OpenAI
const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY
})

// Schema Definition for Chatbot Context
const DB_SCHEMA = `
CRITICAL: DATABASE STRUCTURE (READ CAREFULLY)

1. TABLE 'facturas'
   - Columns: id, numero (string), fecha (date), cliente_id, cliente_razon_social, cliente_email, total (number), estado ('PENDIENTE','PAGADA','ENVIADA'), pagada (bool), enviada (bool), statuses (array text e.g. ['pagada','enviado']), pedido_referencia, descripcion, base_imponible, iva_porcentaje, iva_importe, created_at.

2. TABLE 'presupuestos'
   - Columns: id, numero, fecha, cliente_id, cliente_razon_social, total, estado ('borrador','enviado','aceptado'), pedido_referencia, descripcion, base_imponible, iva_porcentaje, statuses (array), created_at.

3. TABLE 'albaranes'
   - Columns: id, numero, fecha, cliente_id, cliente_razon_social, total, estado ('pendiente','facturado'), pedido_referencia, descripcion, base_imponible, statuses (array), documento_firmado_url, es_enviado, created_at.

4. TABLE 'albaranes' — also contains albaranes firmados (signed) when 'documento_firmado_url' is NOT null.
   - Columns: id, numero, fecha, cliente_id, cliente_razon_social, total, estado, pedido_referencia, descripcion, base_imponible, statuses, documento_firmado_url (URL of the signed PDF, null if not signed), es_enviado (bool), estado_vida ('Pendiente','Traspasado'), created_at.
   - To get signed/firmados: filter WHERE documento_firmado_url IS NOT NULL

5. TABLE 'gastos'
   - Columns: id, fecha, numero, proveedor, referencia_pedido, descripcion, base_imponible, iva_importe, total, factura_url, created_at.

6. TABLE 'notificaciones_historial' (EMAIL LOGS)
   - Columns: id, destinatario, email_destinatario, tipo_documento, numero_documento, asunto, created_at.

7. TABLE 'contactos' (CLIENTS)
   - Columns: id, razon_social, email, telefono, cif, direccion, ciudad, codigo_postal, provincia, notas, total_facturado.
`

const tools = [
    {
        type: "function",
        function: {
            name: "get_all_documents",
            description: "Obtener una lista de documentos recientes (facturas, presupuestos, albaranes). Para gastos o albaranes firmados usa get_gastos o get_albaranes_firmados.",
            parameters: {
                type: "object",
                properties: {
                    document_type: { type: "string", enum: ["all", "factura", "presupuesto", "albaran"] },
                    client_name: { type: "string", description: "Filtrar por nombre de cliente" },
                    status: { type: "string", description: "Filtrar por estado exacto (ej: 'PENDIENTE', 'PAGADA')" },
                    limit: { type: "number", description: "Número de resultados (max 50, default 20)" }
                }
            }
        }
    },
    {
        type: "function",
        function: {
            name: "get_financial_summary",
            description: "Obtener resumen financiero (total facturado, cobrado, pendiente, gastos, beneficios). Usa 'year' y 'month' para consultar un mes específico.",
            parameters: {
                type: "object",
                properties: {
                    period: { type: "string", enum: ["this_month", "last_month", "this_year", "all_time", "custom_month"], description: "Periodo de tiempo. Usa 'custom_month' para un mes específico." },
                    year: { type: "number", description: "Año para consulta personalizada (ej: 2025). Requerido si period='custom_month'" },
                    month: { type: "number", description: "Mes para consulta personalizada (1-12). Requerido si period='custom_month'" }
                }
            }
        }
    },
    {
        type: "function",
        function: {
            name: "get_client_information",
            description: "Obtener información completa de un cliente: facturas, presupuestos, albaranes, gastos, albaranes firmados, correos enviados, teléfono, email.",
            parameters: {
                type: "object",
                properties: {
                    client_name: { type: "string", description: "Nombre parcial o completo del cliente" }
                },
                required: ["client_name"]
            }
        }
    },
    {
        type: "function",
        function: {
            name: "get_contacts",
            description: "Buscar contactos/clientes en la agenda. Devuelve email, teléfono, CIF, dirección y más datos. Úsalo cuando pregunten por datos de contacto, correo o teléfono de un cliente.",
            parameters: {
                type: "object",
                properties: {
                    search: { type: "string", description: "Nombre parcial o completo del cliente a buscar" },
                    limit: { type: "number", description: "Número máximo de resultados (default 20)" }
                }
            }
        }
    },
    {
        type: "function",
        function: {
            name: "get_gastos",
            description: "Obtener gastos/facturas de proveedores. Filtrar por proveedor, periodo o búsqueda de texto.",
            parameters: {
                type: "object",
                properties: {
                    period: { type: "string", enum: ["this_month", "last_month", "this_year", "all_time", "custom_month"], description: "Periodo de tiempo" },
                    year: { type: "number" },
                    month: { type: "number" },
                    proveedor: { type: "string", description: "Filtrar por nombre de proveedor" },
                    search: { type: "string", description: "Buscar en descripción, número o proveedor" },
                    limit: { type: "number", description: "Máximo de resultados (default 20)" }
                }
            }
        }
    },
    {
        type: "function",
        function: {
            name: "get_albaranes_firmados",
            description: "Obtener albaranes firmados digitalizados (subidos con OCR). Filtrar por cliente, estado o periodo.",
            parameters: {
                type: "object",
                properties: {
                    client_name: { type: "string", description: "Filtrar por nombre de cliente" },
                    status: { type: "string", enum: ["Pendiente", "Traspasado"], description: "Estado del albarán firmado" },
                    period: { type: "string", enum: ["this_month", "last_month", "this_year", "all_time"] },
                    limit: { type: "number", description: "Máximo de resultados (default 20)" }
                }
            }
        }
    },
    {
        type: "function",
        function: {
            name: "get_email_history",
            description: "Consultar historial de correos enviados a clientes.",
            parameters: {
                type: "object",
                properties: {
                    client_name: { type: "string", description: "Nombre del cliente para filtrar" },
                    document_type: { type: "string", enum: ["factura", "presupuesto", "albaran"] },
                    limit: { type: "number" }
                }
            }
        }
    },
    {
        type: "function",
        function: {
            name: "get_pending_items",
            description: "Obtener elementos pendientes de acción (facturas impagadas, etc).",
            parameters: {
                type: "object",
                properties: {
                    item_type: { type: "string", enum: ["all", "unpaid_invoices"] }
                }
            }
        }
    },
    {
        type: "function",
        function: {
            name: "search_documents",
            description: "Buscar en TODOS los tipos de documentos y contactos: facturas, presupuestos, albaranes, gastos, albaranes firmados y contactos. Busca por texto libre (número de documento, nombre de cliente/proveedor, referencia de pedido).",
            parameters: {
                type: "object",
                properties: {
                    query: { type: "string", description: "Texto a buscar" }
                },
                required: ["query"]
            }
        }
    }
]

function getDateRange(period: string, year?: number, month?: number) {
    const now = new Date()
    let start: Date, end: Date

    if (period === 'this_month') {
        start = startOfMonth(now)
        end = endOfMonth(now)
    } else if (period === 'last_month') {
        const lastMonth = subMonths(now, 1)
        start = startOfMonth(lastMonth)
        end = endOfMonth(lastMonth)
    } else if (period === 'custom_month' && year && month) {
        const customDate = new Date(year, month - 1, 1)
        start = startOfMonth(customDate)
        end = endOfMonth(customDate)
    } else if (period === 'this_year') {
        start = new Date(now.getFullYear(), 0, 1)
        end = new Date(now.getFullYear(), 11, 31, 23, 59, 59)
    } else {
        // all_time
        start = new Date(2000, 0, 1)
        end = now
    }
    return { start, end }
}

export async function POST(req: Request) {
    try {
        const { messages, transcript } = await req.json()
        const supabase = await createClient()

        // If transcript is provided (from voice), append it as a user message
        const processedMessages = transcript
            ? [...messages, { role: "user", content: transcript }]
            : messages

        // 1. Call OpenAI with tools
        const runner = await openai.chat.completions.create({
            model: "gpt-4o",
            messages: [
                {
                    role: "system",
                    content: `Eres el asistente inteligente del ERP de Flownexion, una consultoría experta en Inteligencia Artificial y automatización. Tienes acceso COMPLETO a todos los datos de la aplicación.

PRINCIPIO FUNDAMENTAL - TRANSPARENCIA ABSOLUTA:
- NUNCA inventes datos, cifras, documentos o información que no exista en la base de datos
- Si NO encuentras información, dilo claramente: "No he encontrado [X] en el sistema"
- SOLO usa datos REALES obtenidos de las herramientas disponibles
- Cuando te pidan datos de contacto de un cliente, usa get_contacts o get_client_information

ACCESO COMPLETO A DATOS (Herramientas disponibles):
✅ Facturas → tabla 'facturas'
✅ Presupuestos → tabla 'presupuestos'
✅ Albaranes → tabla 'albaranes'
✅ Albaranes Firmados → get_albaranes_firmados (filtra tabla 'albaranes' con documento_firmado_url != null)
✅ Gastos de proveedores → get_gastos (tabla 'gastos')
✅ Contactos/Clientes → get_contacts (tabla 'contactos') — incluye email, teléfono, CIF, dirección
✅ Historial de correos enviados → get_email_history
✅ Búsqueda global → search_documents (busca en TODOS los tipos)
✅ Resumen financiero → get_financial_summary
✅ Pendientes → get_pending_items

FORMATO DE RESPUESTAS (OBLIGATORIO):
1. MONEDA: SIEMPRE en Euros (€). Formato: 1.250,50 € (punto para miles, coma para decimales)
2. FECHAS: Formato español dd/mes/año (ej: 23/enero/2026)
3. IDIOMA: Castellano profesional y claro
4. DOCUMENTOS: Cuando menciones un documento, incluye: número, cliente, fecha y total
5. ESTILO: Profesional, conciso, sin emojis superfluos

REGLAS DE BÚSQUEDA:
- Para encontrar el email/teléfono de un cliente → usa get_contacts con el nombre
- Para buscar por número de pedido → usa search_documents con la referencia
- Para gastos de un proveedor → usa get_gastos con el nombre del proveedor
- Para albaranes firmados → usa get_albaranes_firmados
- SIEMPRE ordena los resultados por FECHA DESCENDENTE

${DB_SCHEMA}

Fecha actual: ${new Date().toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' })}`
                },
                ...processedMessages
            ],
            tools: tools as any,
            tool_choice: "auto"
        })

        const message = runner.choices[0].message

        // 2. Handle Tool Calls
        if (message.tool_calls) {
            const toolMessages = []

            for (const toolCall of message.tool_calls) {
                const args = JSON.parse((toolCall as any).function.arguments)
                let result: any = {}

                // GET ALL DOCUMENTS
                if ((toolCall as any).function.name === 'get_all_documents') {
                    const docType = args.document_type || 'all'
                    const limit = args.limit || 20
                    let allDocs: any[] = []

                    if (docType === 'factura' || docType === 'all') {
                        let query = supabase.from('facturas').select('*').order('fecha', { ascending: false }).limit(limit)
                        if (args.client_name) query = query.ilike('cliente_razon_social', `%${args.client_name}%`)
                        if (args.status) query = query.eq('estado', args.status)
                        const { data } = await query
                        allDocs.push(...(data || []).map((d: any) => ({ ...d, type: 'FACTURA' })))
                    }

                    if (docType === 'presupuesto' || docType === 'all') {
                        let query = supabase.from('presupuestos').select('*').order('fecha', { ascending: false }).limit(limit)
                        if (args.client_name) query = query.ilike('cliente_razon_social', `%${args.client_name}%`)
                        const { data } = await query
                        allDocs.push(...(data || []).map((d: any) => ({ ...d, type: 'PRESUPUESTO' })))
                    }

                    if (docType === 'albaran' || docType === 'all') {
                        let query = supabase.from('albaranes').select('*').order('fecha', { ascending: false }).limit(limit)
                        if (args.client_name) query = query.ilike('cliente_razon_social', `%${args.client_name}%`)
                        const { data } = await query
                        allDocs.push(...(data || []).map((d: any) => ({ ...d, type: 'ALBARAN' })))
                    }

                    result = { documents: allDocs.slice(0, limit) }
                }

                // FINANCIAL SUMMARY
                if ((toolCall as any).function.name === 'get_financial_summary') {
                    const period = args.period || 'this_month'
                    const { start, end } = getDateRange(period, args.year, args.month)

                    const { data: facturas } = await supabase.from('facturas').select('total, estado, pagada, statuses').gte('fecha', start.toISOString()).lte('fecha', end.toISOString())
                    const { data: gastos } = await supabase.from('gastos').select('total, base_imponible, iva_importe').gte('fecha', start.toISOString()).lte('fecha', end.toISOString())
                    const { data: presupuestos } = await supabase.from('presupuestos').select('total').gte('fecha', start.toISOString()).lte('fecha', end.toISOString())

                    const totalFacturado = facturas?.reduce((acc: number, curr: any) => acc + (Number(curr.total) || 0), 0) || 0
                    const cobrado = facturas?.filter((f: any) => f.statuses?.includes('pagada') || f.pagada).reduce((acc: number, curr: any) => acc + (Number(curr.total) || 0), 0) || 0
                    const pendiente = totalFacturado - cobrado
                    const totalGastos = gastos?.reduce((acc: number, curr: any) => {
                        return acc + (Number(curr.total) || (Number(curr.base_imponible || 0) + Number(curr.iva_importe || 0)) || 0)
                    }, 0) || 0
                    const totalPresupuestos = presupuestos?.reduce((acc: number, curr: any) => acc + (Number(curr.total) || 0), 0) || 0

                    const formatEuro = (amount: number) => new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(amount)

                    result = {
                        period,
                        total_facturado: formatEuro(totalFacturado),
                        cobrado: formatEuro(cobrado),
                        pendiente_cobro: formatEuro(pendiente),
                        total_gastos: formatEuro(totalGastos),
                        beneficio_neto: formatEuro(cobrado - totalGastos),
                        presupuestos_emitidos: formatEuro(totalPresupuestos),
                        num_facturas: facturas?.length || 0,
                        num_presupuestos: presupuestos?.length || 0,
                        num_gastos: gastos?.length || 0
                    }
                }

                // CLIENT INFORMATION (expanded)
                if ((toolCall as any).function.name === 'get_client_information') {
                    const clientName = args.client_name

                    // Fetch contact info separately to handle not-found gracefully
                    let contacto: any = null
                    try {
                        const { data: c } = await supabase.from('contactos').select('*').ilike('razon_social', `%${clientName}%`).limit(1).single()
                        contacto = c
                    } catch { /* contact not found is ok */ }

                    const [
                        { data: facturas },
                        { data: presupuestos },
                        { data: albaranes },
                        { data: albFirmados },
                        { data: gastos },
                        { data: emails }
                    ] = await Promise.all([
                        supabase.from('facturas').select('id, numero, fecha, total, estado, pedido_referencia').ilike('cliente_razon_social', `%${clientName}%`).order('fecha', { ascending: false }).limit(10),
                        supabase.from('presupuestos').select('id, numero, fecha, total, estado, pedido_referencia').ilike('cliente_razon_social', `%${clientName}%`).order('fecha', { ascending: false }).limit(10),
                        supabase.from('albaranes').select('id, numero, fecha, total, estado, pedido_referencia').ilike('cliente_razon_social', `%${clientName}%`).order('fecha', { ascending: false }).limit(10),
                        supabase.from('albaranes').select('id, numero, fecha, total, estado_vida, pedido_referencia').ilike('cliente_razon_social', `%${clientName}%`).not('documento_firmado_url', 'is', null).order('fecha', { ascending: false }).limit(10),
                        supabase.from('gastos').select('id, numero, fecha, total, proveedor, descripcion').ilike('proveedor', `%${clientName}%`).order('fecha', { ascending: false }).limit(5),
                        supabase.from('notificaciones_historial').select('*').or(`destinatario.ilike.%${clientName}%,asunto.ilike.%${clientName}%`).order('created_at', { ascending: false }).limit(5)
                    ] as any)

                    const totalFacturado = facturas?.reduce((acc: number, curr: any) => acc + (Number(curr.total) || 0), 0) || 0

                    result = {
                        contact_info: contacto || null,
                        total_business: totalFacturado,
                        num_facturas: facturas?.length || 0,
                        num_presupuestos: presupuestos?.length || 0,
                        num_albaranes: albaranes?.length || 0,
                        num_albaranes_firmados: (albFirmados as any[])?.length || 0,
                        recent_invoices: facturas?.slice(0, 5) || [],
                        recent_budgets: presupuestos?.slice(0, 5) || [],
                        recent_albaranes: albaranes?.slice(0, 5) || [],
                        recent_albaranes_firmados: albFirmados?.slice(0, 5) || [],
                        recent_emails: emails || []
                    }
                }

                // GET CONTACTS
                if ((toolCall as any).function.name === 'get_contacts') {
                    let query = supabase.from('contactos').select('*').order('razon_social', { ascending: true })
                    if (args.search) {
                        query = query.or(`razon_social.ilike.%${args.search}%,email.ilike.%${args.search}%,cif.ilike.%${args.search}%,telefono.ilike.%${args.search}%`)
                    }
                    query = query.limit(args.limit || 20)
                    const { data } = await query
                    result = {
                        total: data?.length || 0,
                        contacts: data || []
                    }
                }

                // GET GASTOS
                if ((toolCall as any).function.name === 'get_gastos') {
                    const period = args.period || 'all_time'
                    const { start, end } = getDateRange(period, args.year, args.month)

                    let query = supabase.from('gastos').select('*').order('fecha', { ascending: false })

                    // Only apply date filter when not all_time
                    if (period !== 'all_time') {
                        query = query.gte('fecha', start.toISOString()).lte('fecha', end.toISOString())
                    }

                    if (args.proveedor) {
                        query = query.ilike('proveedor', `%${args.proveedor}%`)
                    }
                    if (args.search) {
                        query = query.or(`proveedor.ilike.%${args.search}%,descripcion.ilike.%${args.search}%,numero.ilike.%${args.search}%`)
                    }

                    query = query.limit(args.limit || 20)
                    const { data } = await query

                    const totalGastos = data?.reduce((acc: number, curr: any) => acc + (Number(curr.total) || 0), 0) || 0
                    const formatEuro = (amount: number) => new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(amount)

                    result = {
                        total_gastos: formatEuro(totalGastos),
                        num_gastos: data?.length || 0,
                        gastos: data || []
                    }
                }

                // GET ALBARANES FIRMADOS
                if ((toolCall as any).function.name === 'get_albaranes_firmados') {
                    let query = supabase.from('albaranes').select('*').not('documento_firmado_url', 'is', null).order('fecha', { ascending: false })

                    if (args.client_name) {
                        query = query.ilike('cliente_razon_social', `%${args.client_name}%`)
                    }
                    if (args.status) {
                        query = query.eq('estado_vida', args.status)
                    }
                    if (args.period && args.period !== 'all_time') {
                        const { start, end } = getDateRange(args.period, args.year, args.month)
                        query = query.gte('fecha', start.toISOString()).lte('fecha', end.toISOString())
                    }

                    query = query.limit(args.limit || 20)
                    const { data, error } = await query

                    if (error) {
                        result = { error: 'Error al consultar albaranes firmados: ' + error.message, albaranes_firmados: [] }
                    } else {
                        const totalAmount = data?.reduce((acc: number, curr: any) => acc + (Number(curr.total) || 0), 0) || 0
                        const formatEuro = (amount: number) => new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(amount)
                        result = {
                            total_importe: formatEuro(totalAmount),
                            num_albaranes_firmados: data?.length || 0,
                            albaranes_firmados: data || []
                        }
                    }
                }

                // EMAIL HISTORY
                if ((toolCall as any).function.name === 'get_email_history') {
                    let query = supabase.from('notificaciones_historial').select('*').order('created_at', { ascending: false })

                    if (args.client_name) {
                        query = query.or(`destinatario.ilike.%${args.client_name}%,asunto.ilike.%${args.client_name}%`)
                    }
                    if (args.document_type) {
                        query = query.eq('tipo_documento', args.document_type)
                    }

                    query = query.limit(args.limit || 10)
                    const { data } = await query
                    result = {
                        total_emails: data?.length || 0,
                        emails: data || []
                    }
                }

                // PENDING ITEMS
                if ((toolCall as any).function.name === 'get_pending_items') {
                    const itemType = args.item_type || 'all'
                    let pendingData: any = {}

                    if (itemType === 'unpaid_invoices' || itemType === 'all') {
                        const { data: unpaid } = await supabase.from('facturas').select('*').neq('estado', 'PAGADA').neq('pagada', true)
                        pendingData.unpaid_invoices = unpaid || []
                        pendingData.total_unpaid_amount = unpaid?.reduce((acc: number, curr: any) => acc + (Number(curr.total) || 0), 0) || 0
                    }

                    result = pendingData
                }

                // SEARCH DOCUMENTS (expanded to all types)
                if ((toolCall as any).function.name === 'search_documents') {
                    const query = args.query

                    const [
                        { data: facturas },
                        { data: presupuestos },
                        { data: albaranes },
                        { data: gastos },
                        { data: contactos },
                        albFirmadosResult
                    ] = await Promise.all([
                        supabase.from('facturas').select('*').or(`numero.ilike.%${query}%,cliente_razon_social.ilike.%${query}%,pedido_referencia.ilike.%${query}%`).order('fecha', { ascending: false }).limit(10),
                        supabase.from('presupuestos').select('*').or(`numero.ilike.%${query}%,cliente_razon_social.ilike.%${query}%,pedido_referencia.ilike.%${query}%`).order('fecha', { ascending: false }).limit(10),
                        supabase.from('albaranes').select('*').or(`numero.ilike.%${query}%,cliente_razon_social.ilike.%${query}%,pedido_referencia.ilike.%${query}%`).order('fecha', { ascending: false }).limit(10),
                        supabase.from('gastos').select('*').or(`numero.ilike.%${query}%,proveedor.ilike.%${query}%,descripcion.ilike.%${query}%,referencia_pedido.ilike.%${query}%`).order('fecha', { ascending: false }).limit(10),
                        supabase.from('contactos').select('*').or(`razon_social.ilike.%${query}%,email.ilike.%${query}%,cif.ilike.%${query}%,telefono.ilike.%${query}%`).limit(10),
                        supabase.from('albaranes').select('*').not('documento_firmado_url', 'is', null).or(`numero.ilike.%${query}%,cliente_razon_social.ilike.%${query}%,pedido_referencia.ilike.%${query}%`).order('fecha', { ascending: false }).limit(10)
                    ] as any)

                    result = {
                        facturas: facturas || [],
                        presupuestos: presupuestos || [],
                        albaranes: albaranes || [],
                        gastos: gastos || [],
                        contactos: contactos || [],
                        albaranes_firmados: albFirmadosResult?.data || []
                    }
                }

                toolMessages.push({
                    tool_call_id: toolCall.id,
                    role: "tool",
                    name: (toolCall as any).function.name,
                    content: JSON.stringify(result)
                })
            }

            // 3. Second call with tool results
            const finalResponse = await openai.chat.completions.create({
                model: "gpt-4o",
                messages: [
                    {
                        role: "system",
                        content: `Recuerda: usa EMOJIS para estructura visual, NO asteriscos. Formato limpio y espaciado. Cuando muestres datos de contacto (email, teléfono) ponlos claramente para que el usuario pueda copiarlos. Actúa siempre de manera profesional como representante de Flownexion (Consultoría de Inteligencia Artificial).`
                    },
                    ...processedMessages,
                    message,
                    ...toolMessages
                ]
            })

            return NextResponse.json(finalResponse.choices[0].message)
        }

        return NextResponse.json(message)

    } catch (error) {
        console.error("Chat Error:", error)
        return NextResponse.json({
            role: 'assistant',
            content: "❌ Error de sistema. Inténtalo de nuevo."
        }, { status: 500 })
    }
}
