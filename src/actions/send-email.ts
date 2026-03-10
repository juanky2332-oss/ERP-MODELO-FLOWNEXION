'use server'

import nodemailer from 'nodemailer'
import { createClient } from '@/lib/supabase/server'

// Credenciales desde env: GMAIL_USER y GMAIL_PASS (en Gmail usar "Contraseña de aplicación")
function getMailCredentials() {
    const user = process.env.GMAIL_USER
    const pass = process.env.GMAIL_PASS
    return { user, pass }
}

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
    console.log('--- Iniciando sendEmailAction ---')
    const to = formData.get('to') as string
    const cc = formData.get('cc') as string
    const subject = formData.get('subject') as string
    const html = formData.get('html') as string

    console.log('Destinatario:', to)
    console.log('Asunto:', subject)

    // Attachments
    const files = formData.getAll('attachments') as File[]
    console.log('Número de adjuntos:', files.length)

    const { user, pass } = getMailCredentials()
    if (!user || !pass) {
        console.error('ERROR: Credenciales GMAIL no encontradas')
        return {
            success: false,
            error: 'Credenciales de correo no configuradas. Configura GMAIL_USER y GMAIL_PASS en Vercel.',
        }
    }

    // Configuración limpia para Serverless (Sin pool para evitar colas de eventos abiertas)
    const transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: {
            user,
            pass,
        },
    });

    try {
        console.log('Procesando adjuntos a Buffer...')
        const attachments = await Promise.all(files.map(async (file) => {
            const buffer = Buffer.from(await file.arrayBuffer())
            console.log(`Adjunto procesado: ${file.name} (${buffer.length} bytes)`)
            return {
                filename: file.name,
                content: buffer
            }
        }))

        const finalHtml = `${html}${getCorporateSignature()}`

        console.log('Enviando correo vía Nodemailer...')
        const info = await transporter.sendMail({
            from: `"Flownexion" <${user}>`,
            to,
            cc,
            subject,
            html: finalHtml,
            attachments
        })
        console.log('Correo enviado con éxito. MessageId:', info.messageId)

        // 3. Log to History
        try {
            console.log('Registrando en historial Supabase...')
            const supabase = await createClient()
            const tipoDoc = formData.get('tipo_documento') as string || 'Documento'
            const numeroDoc = formData.get('numero_documento') as string || 'N/A'
            const ref = formData.get('pedido_referencia') as string || ''

            const { error: dbError } = await supabase.from('notificaciones_historial').insert({
                remitente: 'Flownexion',
                destinatario: cc ? `${to} (CC: ${cc})` : to,
                tipo_documento: tipoDoc,
                numero_documento: numeroDoc,
                pedido_referencia: ref,
                asunto: subject,
                mensaje: html,
                usuario_nombre: 'ADMIN'
            })

            if (dbError) throw dbError
            console.log('Historial registrado correctamente')
        } catch (logError) {
            console.warn('Error al guardar historial (no crítico):', logError)
        }

        return { success: true }
    } catch (error: any) {
        console.error('CRITICAL ERROR en sendEmailAction:', error)
        let message = error?.message || String(error)
        if (message.includes('Username and Password') || message.includes('BadCredentials') || message.includes('535')) {
            message = 'Gmail rechazó las credenciales. Revisa GMAIL_PASS (debe ser Contraseña de Aplicación).'
        }
        return { success: false, error: message }
    }
}
