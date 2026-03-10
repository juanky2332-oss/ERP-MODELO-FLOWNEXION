'use client'

import { useState } from 'react'
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Loader2, Mail, Paperclip, X, FileText, User } from "lucide-react"
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { generatePDF } from '@/lib/pdf-generator'
import { sendEmailAction } from '@/actions/send-email'
import { updateDocument } from '@/actions/documents'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ClientCombobox } from '@/components/contacts/client-combobox'
import { Contacto } from '@/types'
import { cn } from '@/lib/utils'
import { MultiEmailInput } from '@/components/ui/multi-email-input'

export default function EmailsPage() {
    const queryClient = useQueryClient()
    const [selectedClientId, setSelectedClientId] = useState<string>('')
    const [loading, setLoading] = useState(false)
    const [attachments, setAttachments] = useState<File[]>([])
    const [attachedDocs, setAttachedDocs] = useState<{ id: string, type: 'presupuesto' | 'albaran' | 'factura' | 'albaran_firmado' }[]>([])
    const [to, setTo] = useState<string[]>([])
    const [cc, setCc] = useState<string[]>([])
    const [clientName, setClientName] = useState('')
    const [subject, setSubject] = useState('')
    const [body, setBody] = useState('')

    // Metadatos para el log del primer adjunto (o el principal)
    const [lastAttachedMeta, setLastAttachedMeta] = useState<{ tipo: string, numero: string, ref: string } | null>(null)

    // Fetch Lists for selectors - Inyectamos 'type' para el historial (Cambio 8)
    const { data: invoices } = useQuery({
        queryKey: ['invoices-email'],
        queryFn: async () => {
            const { data } = await supabase.from('facturas').select('*').order('created_at', { ascending: false })
            return data?.map((d: any) => ({ ...d, doc_type: 'factura' })) || []
        }
    })
    const { data: presupuestos } = useQuery({
        queryKey: ['presupuestos-email'],
        queryFn: async () => {
            const { data } = await supabase.from('presupuestos').select('*').order('created_at', { ascending: false })
            return data?.map((d: any) => ({ ...d, doc_type: 'presupuesto' })) || []
        }
    })
    const { data: albaranes } = useQuery({
        queryKey: ['albaranes-email'],
        queryFn: async () => {
            const { data } = await supabase.from('albaranes').select('*').order('created_at', { ascending: false })
            return data?.map((d: any) => ({
                ...d,
                doc_type: d.documento_firmado_url ? 'albaran_firmado' : 'albaran'
            })) || []
        }
    })

    // Fetch Email History (from centralized table)
    const { data: emailHistory } = useQuery({
        queryKey: ['email-history'],
        queryFn: async () => {
            const { data } = await supabase.from('notificaciones_historial').select('*').order('created_at', { ascending: false }).limit(10)
            return data || []
        }
    })

    // ... (lines 33-80)

    // Generic function to fetch and add a document as PDF attachment
    const addDocumentAttachment = async (type: 'factura' | 'albaran' | 'presupuesto' | 'albaran_firmado', id: string) => {
        setLoading(true)
        try {
            // FIX: Handle albaran_firmado correctly (it lives in albaranes table)
            const table = type === 'factura' ? 'facturas' : (type === 'albaran' || type === 'albaran_firmado') ? 'albaranes' : 'presupuestos'
            const { data, error } = await supabase.from(table).select('*').eq('id', id).single()
            if (error) throw error

            // Auto-fill client data if empty
            if (to.length === 0 && data.cliente_id) {
                const { data: cli } = await supabase
                    .from('contactos')
                    .select('email, razon_social, client_emails(email)')
                    .eq('id', data.cliente_id)
                    .single()

                if (cli) {
                    const emails = new Set<string>()
                    if (cli.email) emails.add(cli.email)
                    if (cli.client_emails) {
                        cli.client_emails.forEach((e: any) => emails.add(e.email))
                    }
                    setTo(Array.from(emails))
                    setClientName(cli.razon_social)
                }
            }

            if (!subject) {
                const docLabel = type === 'factura' ? 'Factura' : (type === 'albaran' || type === 'albaran_firmado') ? 'Albarán' : 'Presupuesto'
                setSubject(`${docLabel} ${data.numero} - Flownexion`)
            }

            if (!body) {
                const docLabel = type === 'factura' ? 'Factura' : (type === 'albaran' || type === 'albaran_firmado') ? 'Albarán' : 'Presupuesto'
                setBody(`Estimado cliente,\n\nLe adjuntamos el ${docLabel.toLowerCase()} nº ${data.numero} correspondiente a su solicitud${data.pedido_referencia ? ` con referencia ${data.pedido_referencia}` : ''}.\n\nQuedamos a su disposición para cualquier duda.\n\nAtentamente,`)
            }

            setLastAttachedMeta({
                tipo: type === 'factura' ? 'Factura' : (type === 'albaran' || type === 'albaran_firmado') ? 'Albarán' : 'Presupuesto',
                numero: data.numero,
                ref: data.pedido_referencia || ''
            })

            let file: File

            if (type === 'albaran_firmado' || (type === 'albaran' && data.documento_firmado_url)) {
                // Fetch the existing signed PDF
                const url = data.documento_firmado_url
                const response = await fetch(url)
                const blob = await response.blob()
                file = new File([blob], `Albaran_Firmado_${data.numero}.pdf`, { type: 'application/pdf' })
            } else {
                // Generate PDF
                const pdfBlob = await generatePDF(data, type as any, 'blob') as Blob
                const docLabel = type === 'factura' ? 'Factura' : (type === 'albaran' || type === 'albaran_firmado') ? 'Albarán' : 'Presupuesto'
                file = new File([pdfBlob], `${docLabel}_${data.numero}.pdf`, { type: 'application/pdf' })
            }

            setAttachments(prev => [...prev, file])
            // Track document for status update when sending
            setAttachedDocs(prev => [...prev, { id, type }])

            toast.success(`Adjuntado: ${file.name}`)

        } catch (e: any) {
            toast.error('Error al adjuntar: ' + e.message)
            console.error(e)
        } finally {
            setLoading(false)
        }
    }
    // ...

    const handleSend = async (e: React.FormEvent) => {
        e.preventDefault()
        setLoading(true)

        const formData = new FormData()
        formData.append('to', to.join(', '))
        formData.append('cc', cc.join(', '))
        formData.append('subject', subject)
        formData.append('html', body.replace(/\n/g, '<br>'))

        if (lastAttachedMeta) {
            formData.append('tipo_documento', lastAttachedMeta.tipo)
            formData.append('numero_documento', lastAttachedMeta.numero)
            formData.append('pedido_referencia', lastAttachedMeta.ref)
        }

        attachments.forEach(file => {
            formData.append('attachments', file)
        })

        try {
            const res = await sendEmailAction(formData)

            if (res.success) {
                toast.success('Correo enviado correctamente')

                // Actualizar estados de los documentos adjuntos
                if (attachedDocs.length > 0) {
                    try {
                        console.log('Actualizando estados de documentos enviados:', attachedDocs)
                        await Promise.all(attachedDocs.map(async (doc) => {
                            // Intentamos actualizar. Manejamos la inconsistencia de nombres de columna
                            // Obtener estados actuales primero para no perderlos
                            // Nota: Idealmente deberíamos hacer un fetch fresco, pero por eficiencia usamos lo que sabemos si es posible.
                            // Sin embargo, para seguridad, haremos un fetch rápido del status actual o confiaremos en que el backend maneje el merge (supabase update es overwrite).
                            // Vamos a hacer un fetch rápido para asegurar integridad.
                            const table = doc.type === 'factura' ? 'facturas' : (doc.type === 'albaran' || doc.type === 'albaran_firmado') ? 'albaranes' : 'presupuestos'
                            const { data: currentDoc } = await supabase.from(table).select('statuses').eq('id', doc.id).single()

                            const currentStatuses = new Set(currentDoc?.statuses || [])
                            currentStatuses.add('enviado')

                            const updateData: any = {
                                statuses: Array.from(currentStatuses)
                            }

                            // Apply specific fields based on document type to avoid "column does not exist" errors
                            if (doc.type === 'factura') {
                                updateData.enviada = true
                                // Removed fecha_envio to ensure update success
                            } else if (doc.type === 'presupuesto') {
                                updateData.enviado = true
                                // Removed fecha_envio to ensure update success
                            } else if (doc.type === 'albaran' || doc.type === 'albaran_firmado') {
                                updateData.es_enviado = true
                            }

                            const resType = doc.type === 'albaran_firmado' ? 'albaran' : doc.type
                            const updateRes = await updateDocument(doc.id, updateData, resType)

                            if (!updateRes.success) {
                                console.warn(`No se pudo actualizar el estado de ${doc.type} ${doc.id}:`, updateRes.error)
                                toast.error(`Error actualizando ${doc.type}: ${JSON.stringify(updateRes.error)}`)
                            }
                        }))

                        // Invalidad caches globales post-envío por seguridad
                        queryClient.invalidateQueries({ queryKey: ['facturas'] })
                        queryClient.invalidateQueries({ queryKey: ['albaranes'] })
                        queryClient.invalidateQueries({ queryKey: ['presupuestos'] })

                        toast.success('Proceso de actualización de estados finalizado')
                    } catch (updateError) {
                        console.error('Error general actualizando estados:', updateError)
                        toast.error('El correo se envió, pero hubo un error al actualizar los estados en la base de datos.')
                    }
                }

                setAttachments([])
                setAttachedDocs([])
            } else {
                toast.error('Error enviando correo: ' + res.error)
            }
        } catch (error: any) {
            console.error('Error al invocar Server Action:', error)
            toast.error('Error de red al enviar el correo. Verifica el tamaño de los adjuntos o tu conexión.')
        } finally {
            setLoading(false)
        }
    }

    return (
        <div className="max-w-6xl mx-auto space-y-6">
            <h1 className="text-3xl font-bold tracking-tight text-gray-900 flex items-center gap-3">
                <Mail className="text-[#1E88E5]" /> Envío de Documentos
            </h1>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                <div className="lg:col-span-3 space-y-4">
                    <Card className="h-fit">
                        <CardHeader className="pb-3">
                            <CardTitle className="text-lg flex items-center gap-2">
                                <User className="h-5 w-5 text-[#1E88E5]" />
                                Filtrar por Cliente
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="space-y-2">
                                <Label className="text-xs uppercase text-gray-400">Cliente Destino</Label>
                                <ClientCombobox
                                    value={selectedClientId}
                                    onChange={(val: string, contact?: Contacto) => {
                                        setSelectedClientId(val)
                                        if (contact) {
                                            setClientName(contact.razon_social)

                                            // Primary Email -> To
                                            if (contact.email) {
                                                setTo([contact.email])
                                            } else {
                                                setTo([])
                                            }

                                            // Secondary Emails -> CC
                                            const secondaryEmails = new Set<string>()

                                            // From 'emails' array (if cached/joined)
                                            if ((contact as any).emails && Array.isArray((contact as any).emails)) {
                                                (contact as any).emails.forEach((e: string) => {
                                                    if (e !== contact.email) secondaryEmails.add(e)
                                                })
                                            }

                                            // From 'client_emails' relation (if fetched)
                                            if ((contact as any).client_emails) {
                                                (contact as any).client_emails.forEach((e: any) => {
                                                    if (e.email !== contact.email) secondaryEmails.add(e.email)
                                                })
                                            }

                                            setCc(Array.from(secondaryEmails))
                                        }
                                    }}
                                />
                                {selectedClientId && (
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        className="w-full text-xs text-red-500"
                                        onClick={() => {
                                            setSelectedClientId('')
                                            setClientName('')
                                            setTo([])
                                            setCc([])
                                        }}
                                    >
                                        Limpiar Filtro
                                    </Button>
                                )}
                            </div>
                        </CardContent>
                    </Card>

                    <Card className="h-fit">
                        <CardHeader className="pb-3">
                            <CardTitle className="text-lg">Documentos</CardTitle>
                            <p className="text-xs text-gray-500">
                                {selectedClientId ? 'Filtrado por cliente seleccionado' : 'Seleccione un cliente para filtrar'}
                            </p>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="space-y-2">
                                <Label className="text-xs uppercase text-gray-400 font-bold">Facturas</Label>
                                <Select onValueChange={(val: string) => addDocumentAttachment('factura', val)}>
                                    <SelectTrigger className="border-[#1E88E5]/30">
                                        <SelectValue placeholder="Seleccionar factura..." />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {(selectedClientId
                                            ? invoices?.filter((i: any) => String(i.cliente_id) === String(selectedClientId) || (!i.cliente_id && i.cliente_razon_social === clientName))
                                            : invoices
                                        )?.map((inv: any) => (
                                            <SelectItem key={inv.id} value={inv.id}>{inv.numero} - {inv.cliente_razon_social}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>

                            <div className="space-y-2">
                                <Label className="text-xs uppercase text-gray-400 font-bold">Albaranes</Label>
                                <Select onValueChange={(val: string) => addDocumentAttachment('albaran', val)}>
                                    <SelectTrigger className="border-[#1E88E5]/30">
                                        <SelectValue placeholder="Seleccionar albarán..." />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {(selectedClientId
                                            ? albaranes?.filter((i: any) => String(i.cliente_id) === String(selectedClientId) || (!i.cliente_id && i.cliente_razon_social === clientName))
                                            : albaranes
                                        )?.map((alb: any) => (
                                            <SelectItem key={alb.id} value={alb.id}>{alb.numero} - {alb.cliente_razon_social}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>

                            <div className="space-y-2">
                                <Label className="text-xs uppercase text-gray-400 font-bold">Presupuestos</Label>
                                <Select onValueChange={(val: string) => addDocumentAttachment('presupuesto', val)}>
                                    <SelectTrigger className="border-[#1E88E5]/30">
                                        <SelectValue placeholder="Seleccionar presupuesto..." />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {(selectedClientId
                                            ? presupuestos?.filter((i: any) => String(i.cliente_id) === String(selectedClientId) || (!i.cliente_id && i.cliente_razon_social === clientName))
                                            : presupuestos
                                        )?.map((pre: any) => (
                                            <SelectItem key={pre.id} value={pre.id}>{pre.numero} - {pre.cliente_razon_social}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>

                            <div className="space-y-2">
                                <Label className="text-xs uppercase text-gray-400 font-bold">Albaranes Firmados</Label>
                                <Select onValueChange={(val: string) => addDocumentAttachment('albaran_firmado', val)}>
                                    <SelectTrigger className="border-green-500/30">
                                        <SelectValue placeholder="Seleccionar firmado..." />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {(selectedClientId
                                            ? albaranes?.filter((i: any) => (String(i.cliente_id) === String(selectedClientId) || (!i.cliente_id && i.cliente_razon_social === clientName)) && i.documento_firmado_url)
                                            : albaranes?.filter((i: any) => i.documento_firmado_url)
                                        )?.map((alb: any) => (
                                            <SelectItem key={alb.id} value={alb.id}>🖋️ {alb.numero} - {alb.cliente_razon_social}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                        </CardContent>
                    </Card>
                </div>

                <div className="lg:col-span-9">
                    <Card>
                        <CardHeader>
                            <CardTitle>Componer Email</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <form onSubmit={handleSend} className="space-y-4">
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div className="space-y-2">
                                        <Label>Nombre Cliente</Label>
                                        <Input value={clientName} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setClientName(e.target.value)} placeholder="Nombre del cliente" />
                                    </div>
                                    <div className="space-y-2">
                                        <Label>Destinatario (Para)</Label>
                                        <MultiEmailInput
                                            emails={to}
                                            onEmailsChange={setTo}
                                            placeholder="Añadir destinatarios..."
                                        />
                                    </div>
                                    <div className="space-y-2 col-span-1 md:col-span-2">
                                        <Label>Copia (CC) - Opcionales</Label>
                                        <MultiEmailInput
                                            emails={cc}
                                            onEmailsChange={setCc}
                                            placeholder="Añadir copias..."
                                        />
                                    </div>
                                </div>

                                <div className="space-y-2">
                                    <Label>Asunto</Label>
                                    <Input value={subject} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSubject(e.target.value)} placeholder="Asunto del correo" />
                                </div>

                                <div className="space-y-2">
                                    <Label>Mensaje</Label>
                                    <Textarea
                                        value={body}
                                        onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setBody(e.target.value)}
                                        className="min-h-[150px]"
                                    />
                                </div>

                                <div className="space-y-2">
                                    <Label>Adjuntos ({attachments.length})</Label>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                                        {attachments.map((file, i) => (
                                            <div key={i} className="flex items-center justify-between p-2 bg-gray-50 rounded border text-sm">
                                                <div className="flex items-center gap-2 truncate">
                                                    <FileText className="h-4 w-4 text-gray-400" />
                                                    <span className="truncate">{file.name}</span>
                                                </div>
                                                <Button type="button" variant="ghost" size="icon" className="h-6 w-6" onClick={() => {
                                                    setAttachments(prev => prev.filter((_, idx) => idx !== i))
                                                    setAttachedDocs(prev => prev.filter((_, idx) => idx !== i))
                                                }}>
                                                    <X className="h-3 w-3" />
                                                </Button>
                                            </div>
                                        ))}
                                        <div className="relative">
                                            <input
                                                type="file"
                                                id="add-attach"
                                                className="hidden"
                                                multiple
                                                onChange={(e) => {
                                                    if (e.target.files) {
                                                        setAttachments(prev => [...prev, ...Array.from(e.target.files as FileList)])
                                                    }
                                                }}
                                            />
                                            <Label htmlFor="add-attach" className="flex items-center justify-center p-2 border-2 border-dashed rounded-lg text-sm text-gray-500 hover:border-[#1E88E5] hover:text-[#1E88E5] cursor-pointer transition-colors h-10">
                                                <Paperclip className="h-3 w-3 mr-2" /> Adjuntar otro archivo
                                            </Label>
                                        </div>
                                    </div>
                                </div>

                                <div className="pt-4 flex justify-end">
                                    <Button type="submit" disabled={loading} className="bg-[#1E88E5] hover:bg-[#1565C0] w-full md:w-auto">
                                        {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Mail className="mr-2 h-4 w-4" />}
                                        {loading ? 'Enviando...' : 'Enviar Correo'}
                                    </Button>
                                </div>
                            </form>
                        </CardContent>
                    </Card>
                </div>
            </div >
        </div >
    )
}
