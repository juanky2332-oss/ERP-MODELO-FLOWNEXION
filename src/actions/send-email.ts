'use server'

import { Resend } from 'resend'
import { createClient } from '@/lib/supabase/server'

const resend = new Resend(process.env.RESEND_API_KEY)

function getCorporateSignature() {
    return `
<br><br>
--<br>
<b>FLOWNEXION - FLOW AUTOMATE SOLUTIONS S.L.</b><br>
NIF: B22770028<br>
Plaza Zaldiaran, 3 bajo izq<br>
Vitoria-Gasteiz (01012), Álava, España<br>
`
}

export async function sendEmailAction(formData: FormData) {
    const to = formData.get('to') as string
    const cc = formData.get('cc') as string
    const subject = formData.get('subject') as string
    const html = formData.get('html') as string
    const files = formData.getAll('attachments') as File[]

    if (!process.env.RESEND_API_KEY) {
        return { success: false, error: 'RESEND_API_KEY no configurada en variables de entorno.' }
    }

    try {
        const attachments = await Promise.all(files.map(async (file) => ({
            filename: file.name,
            content: Buffer.from(await file.arrayBuffer())
        })))

        await resend.emails.send({
            from: 'Flownexion <onboarding@resend.dev>',
            to: to.split(', '),
            cc: cc ? cc.split(', ') : undefined,
            subject,
            html: `${html}${getCorporateSignature()}`,
            attachments
        })

        try {
            const supabase = await createClient()
            const tipoDoc = formData.get('tipo_documento') as string || 'Documento'
            const numeroDoc = formData.get('numero_documento') as string || 'N/A'
            const ref = formData.get('pedido_referencia') as string || ''

            await supabase.from('notificaciones_historial').insert({
                remitente: 'Flownexion',
                destinatario: cc ? `${to} (CC: ${cc})` : to,
                tipo_documento: tipoDoc,
                numero_documento: numeroDoc,
                pedido_referencia: ref,
                asunto: subject,
                mensaje: html,
                usuario_nombre: 'ADMIN'
            })
        } catch (logError) {
            console.warn('No se pudo registrar en historial:', logError)
        }

        return { success: true }
    } catch (error: any) {
        return { success: false, error: error.message }
    }
}
