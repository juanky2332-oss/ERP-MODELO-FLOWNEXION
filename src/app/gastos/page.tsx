'use client'

import { useState } from 'react'
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow
} from '@/components/ui/table'
import { Button } from '@/components/ui/button'
import { Plus, Search, Upload, Trash2, Loader2, FileText, RotateCcw, PenLine } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { toast } from 'sonner'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import { processExpense } from '@/actions/secure-upload'
import { SortableHeader } from '@/components/ui/sortable-header'
import { useGlobalFilter } from '@/components/providers/global-filter-provider'
import { GlobalDateSelector } from '@/components/ui/global-date-selector'
import Link from 'next/link'
import { useExpenses } from '@/hooks/use-expenses'
import { Card } from '@/components/ui/card'
import { DocumentPreviewModal } from '@/components/documents/document-preview-modal'
import { cn, formatCurrency } from '@/lib/utils'

export default function GastosPage() {
    const { month, year } = useGlobalFilter()
    const [page, setPage] = useState(1)
    const [search, setSearch] = useState('')
    const [sortConfig, setSortConfig] = useState<{ key: string, direction: 'asc' | 'desc' } | null>(null)
    const pageSize = 10

    // Modals state
    const [isUploadOpen, setIsUploadOpen] = useState(false)
    const [isManualOpen, setIsManualOpen] = useState(false)

    // File Upload state
    const [file, setFile] = useState<File | null>(null)
    const [uploading, setUploading] = useState(false)

    // Manual Entry Form
    const [manualForm, setManualForm] = useState({
        fecha: new Date().toISOString().split('T')[0],
        numero: '',
        referencia_pedido: '',
        proveedor: '',
        descripcion: '',
        base_imponible: '',
        iva_importe: '',
        total: ''
    })

    const { gastos, totalCount, stats, isLoading, createExpense, deleteExpense } = useExpenses({
        page,
        pageSize,
        search,
        month,
        year,
        sortConfig
    })

    const totalPages = Math.ceil(totalCount / pageSize)

    // Mutation Wrappers
    const handleCreateManual = () => {
        createExpense.mutate(manualForm, {
            onSuccess: () => {
                setIsManualOpen(false)
                setManualForm({ fecha: new Date().toISOString().split('T')[0], numero: '', referencia_pedido: '', proveedor: '', descripcion: '', base_imponible: '', iva_importe: '', total: '' })
            }
        })
    }

    const handleUpload = async () => {
        if (!file) return
        setUploading(true)
        try {
            const formData = new FormData()
            formData.append('file', file)
            const result = await processExpense(formData) // Ensure this action invalidates 'gastos' query or we do it manually via a hook if needed. 
            // Wait, processExpense is server action. Ideally we should call a hook mutation or invalidate queries here. 
            // Since processExpense is external, we can just invalidate manually.

            if (result.success) {
                // We need to invalidate query manually since we bypass hook mutation
                // But we don't have access to queryClient here easily without useQueryClient hook or passing it from useExpenses.
                // Re-calling useExpenses creates a new hook instance but share same QueryClient context.
                // Let's rely on page refresh or user manual refresh for now, OR better, expose a 'refetch' from useExpenses or useQueryClient here.
                // I will add useQueryClient here to be safe.
                toast.success('Gasto procesado correctamente')
                window.location.reload() // Simplest for now given mixed action usage
            } else {
                toast.error('Error en OCR: ' + result.error)
            }
        } catch (error: any) {
            toast.error('Error al subir archivo: ' + error.message)
        } finally {
            setUploading(false)
            setIsUploadOpen(false)
            setFile(null)
        }
    }

    return (
        <div className="space-y-6 max-w-[1600px] w-full mx-auto px-6 py-8 animate-in fade-in duration-500">
            {/* Header Section */}
            <div className="flex flex-col gap-6">
                <div className="flex justify-between items-start">
                    <div>
                        <h1 className="text-3xl font-black text-slate-900 tracking-tight">Gastos</h1>
                        <p className="text-slate-500 mt-1">Control de gastos y proveedores</p>
                    </div>

                    <div className="flex items-center gap-4">
                        <GlobalDateSelector />

                        {/* Action Buttons */}
                        <div className="flex gap-2">
                            <Dialog open={isManualOpen} onOpenChange={setIsManualOpen}>
                                <DialogTrigger asChild>
                                    <Button variant="outline" className="border-slate-200 text-slate-600 font-bold hover:bg-slate-50 rounded-xl shadow-sm">
                                        <PenLine className="mr-2 h-4 w-4" /> Manual
                                    </Button>
                                </DialogTrigger>
                                <DialogContent className="sm:max-w-[425px] rounded-2xl">
                                    <DialogHeader>
                                        <DialogTitle>Registrar Gasto Manualmente</DialogTitle>
                                    </DialogHeader>
                                    <div className="grid gap-4 py-4">
                                        <div className="grid grid-cols-2 gap-2">
                                            <div>
                                                <Label htmlFor="date">Fecha</Label>
                                                <Input id="date" type="date" value={manualForm.fecha} onChange={e => setManualForm({ ...manualForm, fecha: e.target.value })} />
                                            </div>
                                            <div>
                                                <Label htmlFor="number">Documento Nº</Label>
                                                <Input id="number" placeholder="Ej: F-2026-001" value={manualForm.numero} onChange={e => setManualForm({ ...manualForm, numero: e.target.value })} />
                                            </div>
                                        </div>
                                        <div className="grid gap-2">
                                            <Label htmlFor="provider">Proveedor</Label>
                                            <Input id="provider" value={manualForm.proveedor} onChange={e => setManualForm({ ...manualForm, proveedor: e.target.value })} />
                                        </div>
                                        <div className="grid gap-2">
                                            <Label htmlFor="ref">Referencia Pedido</Label>
                                            <Input id="ref" placeholder="Ej: 4500114195" value={manualForm.referencia_pedido} onChange={e => setManualForm({ ...manualForm, referencia_pedido: e.target.value })} />
                                        </div>
                                        <div className="grid gap-2">
                                            <Label htmlFor="desc">Descripción</Label>
                                            <Input id="desc" value={manualForm.descripcion} onChange={e => setManualForm({ ...manualForm, descripcion: e.target.value })} />
                                        </div>
                                        <div className="grid grid-cols-3 gap-2">
                                            <div>
                                                <Label htmlFor="base">Base</Label>
                                                <Input id="base" type="number" step="0.01" value={manualForm.base_imponible} onChange={e => setManualForm({ ...manualForm, base_imponible: e.target.value })} />
                                            </div>
                                            <div>
                                                <Label htmlFor="vat">IVA</Label>
                                                <Input id="vat" type="number" step="0.01" value={manualForm.iva_importe} onChange={e => setManualForm({ ...manualForm, iva_importe: e.target.value })} />
                                            </div>
                                            <div>
                                                <Label htmlFor="total">Total</Label>
                                                <Input id="total" type="number" step="0.01" value={manualForm.total} onChange={e => setManualForm({ ...manualForm, total: e.target.value })} />
                                            </div>
                                        </div>
                                        <Button onClick={handleCreateManual} disabled={createExpense.isPending} className="w-full mt-2 bg-rose-600 hover:bg-rose-700 text-white font-bold rounded-xl">
                                            {createExpense.isPending ? <Loader2 className="animate-spin" /> : 'Guardar Gasto'}
                                        </Button>
                                    </div>
                                </DialogContent>
                            </Dialog>

                            <Dialog open={isUploadOpen} onOpenChange={setIsUploadOpen}>
                                <DialogTrigger asChild>
                                    <Button className="bg-rose-600 hover:bg-rose-700 text-white rounded-xl shadow-lg shadow-rose-500/20 font-bold transition-all hover:scale-105 active:scale-95">
                                        <Upload className="mr-2 h-4 w-4" /> Subir Factura (OCR)
                                    </Button>
                                </DialogTrigger>
                                <DialogContent className="sm:max-w-[425px] rounded-2xl">
                                    <DialogHeader>
                                        <DialogTitle>Subir Factura / Ticket</DialogTitle>
                                    </DialogHeader>
                                    <div className="grid gap-4 py-4">
                                        <div className="border-2 border-dashed border-slate-200 rounded-xl p-8 text-center hover:bg-slate-50 transition-colors cursor-pointer relative">
                                            <input
                                                type="file"
                                                accept="image/*,.pdf"
                                                className="absolute inset-0 opacity-0 cursor-pointer"
                                                onChange={(e) => setFile(e.target.files?.[0] || null)}
                                            />
                                            <div className="flex flex-col items-center gap-2 text-slate-500">
                                                <Upload className="h-8 w-8 text-slate-300" />
                                                <span className="font-medium text-sm">{file ? file.name : 'Arrastra o selecciona un archivo'}</span>
                                            </div>
                                        </div>
                                        <Button disabled={!file || uploading} onClick={handleUpload} className="w-full bg-rose-600 hover:bg-rose-700 text-white font-bold rounded-xl">
                                            {uploading ? <Loader2 className="animate-spin mr-2" /> : null}
                                            {uploading ? 'Procesando con IA...' : 'Procesar Gasto'}
                                        </Button>
                                    </div>
                                </DialogContent>
                            </Dialog>
                        </div>
                    </div>
                </div>

                {/* Metrics Section */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4">
                    <Card className="p-4 border-slate-200/60 shadow-sm bg-white/50 backdrop-blur-sm">
                        <div className="flex flex-row items-center justify-between space-y-0 pb-2">
                            <h3 className="tracking-tight text-sm font-medium text-slate-500">Total Gastos</h3>
                            <FileText className="h-4 w-4 text-rose-400" />
                        </div>
                        <div className="text-2xl font-bold text-slate-900">{formatCurrency(stats.totalGastos)}</div>
                        <p className="text-xs text-slate-500 mt-1">En el periodo seleccionado</p>
                    </Card>
                </div>
            </div>

            {/* Search */}
            <div className="flex items-center gap-2 justify-end">
                <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                    <Input
                        placeholder="Buscar gasto..."
                        className="pl-9 w-[300px] bg-white border-slate-200 focus:border-rose-500 transition-all font-medium"
                        value={search}
                        onChange={(e) => {
                            setSearch(e.target.value)
                            setPage(1)
                        }}
                    />
                </div>
            </div>

            {/* Table */}
            <div className="bg-white border boundary-slate-200 rounded-3xl shadow-xl shadow-slate-200/20 overflow-hidden">
                <Table>
                    <TableHeader className="bg-slate-50/80 backdrop-blur">
                        <TableRow className="hover:bg-transparent border-b border-slate-100">
                            <TableHead className="w-[120px]">
                                <SortableHeader
                                    label="Fecha"
                                    columnKey="fecha"
                                    currentSort={sortConfig}
                                    onSort={(k, d) => setSortConfig({ key: k, direction: d })}
                                />
                            </TableHead>
                            <TableHead className="w-[150px]">
                                <SortableHeader
                                    label="Documento"
                                    columnKey="numero"
                                    currentSort={sortConfig}
                                    onSort={(k, d) => setSortConfig({ key: k, direction: d })}
                                />
                            </TableHead>
                            <TableHead>
                                <SortableHeader
                                    label="Proveedor"
                                    columnKey="proveedor"
                                    currentSort={sortConfig}
                                    onSort={(k, d) => setSortConfig({ key: k, direction: d })}
                                />
                            </TableHead>
                            <TableHead className="font-bold text-xs uppercase tracking-wider text-slate-400 hidden md:table-cell">Descripción</TableHead>
                            <TableHead className="text-right w-[100px]">Base</TableHead>
                            <TableHead className="text-right w-[100px]">IVA</TableHead>
                            <TableHead className="text-right w-[120px]">
                                <SortableHeader
                                    label="Total"
                                    columnKey="total"
                                    currentSort={sortConfig}
                                    onSort={(k, d) => setSortConfig({ key: k, direction: d })}
                                />
                            </TableHead>
                            <TableHead className="w-[140px] text-center">Acciones</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {isLoading ? (
                            <TableRow>
                                <TableCell colSpan={9} className="h-32 text-center">
                                    <div className="flex justify-center"><Loader2 className="animate-spin h-6 w-6 text-rose-600" /></div>
                                </TableCell>
                            </TableRow>
                        ) : gastos.length === 0 ? (
                            <TableRow>
                                <TableCell colSpan={8} className="h-32 text-center text-slate-400 font-medium">
                                    No se encontraron gastos
                                </TableCell>
                            </TableRow>
                        ) : (
                            gastos.map((gasto) => (
                                <TableRow key={gasto.id} className="group hover:bg-slate-50/50 transition-colors border-slate-50">
                                    <TableCell className="pl-6 py-4">
                                        <div className="flex flex-col">
                                            <span className="font-mono text-xs font-bold text-slate-600 capitalize">{format(new Date(gasto.fecha), 'MMM yyyy', { locale: es })}</span>
                                            <span className="font-mono text-xs font-medium text-slate-400">{format(new Date(gasto.fecha), 'dd', { locale: es })}</span>
                                        </div>
                                    </TableCell>
                                    <TableCell className="py-4">
                                        <span className="font-bold text-sm text-slate-900">{gasto.numero || '-'}</span>
                                    </TableCell>
                                    <TableCell className="py-4">
                                        <div className="flex flex-col">
                                            <span className="font-bold text-sm text-slate-900">{gasto.proveedor}</span>
                                            {gasto.referencia_pedido && (
                                                <span className="text-[10px] text-slate-400 font-mono mt-0.5">Ref: {gasto.referencia_pedido}</span>
                                            )}
                                        </div>
                                    </TableCell>
                                    <TableCell className="hidden md:table-cell max-w-[200px] truncate py-4 text-xs font-medium text-slate-500">{gasto.descripcion}</TableCell>
                                    <TableCell className="text-right py-4 text-xs font-medium text-slate-600">{formatCurrency(gasto.base_imponible)}</TableCell>
                                    <TableCell className="text-right py-4 text-xs font-medium text-slate-600">{formatCurrency(gasto.iva_importe)}</TableCell>
                                    <TableCell className="text-right py-4 pr-6 font-mono text-sm font-bold text-rose-700">{formatCurrency(gasto.total)}</TableCell>
                                    <TableCell className="py-4 text-center">
                                        <div className="flex justify-center gap-1">
                                            <DocumentPreviewModal
                                                document={gasto}
                                                type="gasto"
                                                url={gasto.factura_url}
                                                title={`Gasto ${gasto.numero || ''}`}
                                            />
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                className="h-8 w-8 text-rose-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg"
                                                onClick={() => {
                                                    if (confirm('¿Eliminar gasto?')) {
                                                        deleteExpense.mutate(gasto.id)
                                                    }
                                                }}
                                            >
                                                <Trash2 className="h-4 w-4" />
                                            </Button>
                                        </div>
                                    </TableCell>
                                </TableRow>
                            ))
                        )}
                    </TableBody>
                </Table>
            </div>

            {/* Pagination Controls */}
            {!isLoading && totalPages > 1 && (
                <div className="flex items-center justify-center gap-2 mt-8">
                    <Button variant="outline" size="sm" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}>Anterior</Button>
                    <span className="text-xs font-bold text-slate-400 px-2">{page} de {totalPages}</span>
                    <Button variant="outline" size="sm" onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}>Siguiente</Button>
                </div>
            )}

        </div>
    )
}
