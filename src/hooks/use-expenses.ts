'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { toast } from 'sonner'
import { endOfMonth, startOfMonth } from 'date-fns'

export interface Gasto {
    id: string
    fecha: string
    numero: string
    referencia_pedido?: string
    proveedor: string
    descripcion: string
    base_imponible: number
    iva_importe: number
    total: number
    factura_url?: string
    created_at: string
}

export function useExpenses({
    page = 1,
    pageSize = 10,
    search = '',
    month = 'all',
    year = 'all',
    sortConfig = null
}: {
    page?: number,
    pageSize?: number,
    search?: string,
    month?: string,
    year?: string,
    sortConfig?: { key: string, direction: 'asc' | 'desc' } | null
} = {}) {
    const queryClient = useQueryClient()

    const { data, isLoading } = useQuery({
        queryKey: ['gastos', page, pageSize, search, month, year, sortConfig],
        queryFn: async () => {
            // Helper to get date range
            const getDateRange = () => {
                let start: string | undefined
                let end: string | undefined

                const currentYear = year === 'all' ? undefined : Number(year)
                const currentMonth = month === 'all' ? undefined : Number(month)

                if (currentYear && currentMonth !== undefined) {
                    const d = new Date(currentYear, currentMonth, 1)
                    start = d.toISOString()
                    end = endOfMonth(d).toISOString()
                } else if (currentYear) {
                    const d = new Date(currentYear, 0, 1)
                    start = d.toISOString()
                    end = new Date(currentYear, 11, 31, 23, 59, 59).toISOString()
                }
                return { start, end }
            }

            const { start, end } = getDateRange()

            // 1. Main Data Query
            let query = supabase.from('gastos').select('*', { count: 'exact' })

            // Apply Date Filter
            if (start && end) {
                query = query.gte('fecha', start).lte('fecha', end)
            }

            // Apply Search
            if (search) {
                query = query.or(`proveedor.ilike.%${search}%,numero.ilike.%${search}%,descripcion.ilike.%${search}%`)
            }

            // Apply Sort
            if (sortConfig) {
                query = query.order(sortConfig.key, { ascending: sortConfig.direction === 'asc' })
            } else {
                query = query.order('fecha', { ascending: false })
            }

            const from = (page - 1) * pageSize
            const to = from + pageSize - 1

            const { data: pageData, count, error } = await query.range(from, to)
            if (error) throw error

            // 2. Stats (Total Gastos) - Respecting Date Filter
            let statsQuery = supabase.from('gastos').select('total')
            if (start && end) {
                statsQuery = statsQuery.gte('fecha', start).lte('fecha', end)
            }
            const { data: statsData } = await statsQuery

            const totalGastos = statsData?.reduce((acc, curr) => acc + (curr.total || 0), 0) || 0

            return {
                items: pageData as Gasto[],
                totalCount: count || 0,
                stats: {
                    totalGastos
                }
            }
        }
    })

    const gastos = data?.items || []
    const totalCount = data?.totalCount || 0
    const stats = data?.stats || { totalGastos: 0 }

    // Mutations
    const updateExpense = useMutation({
        mutationFn: async (data: any) => {
            const payload = {
                ...data,
                base_imponible: parseFloat(data.base_imponible) || 0,
                iva_importe: parseFloat(data.iva_importe) || 0,
                total: parseFloat(data.total) || 0
            }
            const { error } = await supabase.from('gastos').update(payload).eq('id', data.id)
            if (error) throw error
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['gastos'] })
            toast.success('Gasto actualizado')
        },
        onError: (error: any) => {
            toast.error('Error: ' + error.message)
        }
    })

    const createExpense = useMutation({
        mutationFn: async (data: any) => {
            const payload = {
                ...data,
                base_imponible: parseFloat(data.base_imponible) || 0,
                iva_importe: parseFloat(data.iva_importe) || 0,
                total: parseFloat(data.total) || 0
            }
            const { error } = await supabase.from('gastos').insert(payload)
            if (error) throw error
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['gastos'] })
            toast.success('Gasto creado')
        },
        onError: (error: any) => {
            toast.error('Error: ' + error.message)
        }
    })

    const deleteExpense = useMutation({
        mutationFn: async (id: string) => {
            const { error } = await supabase.from('gastos').delete().eq('id', id)
            if (error) throw error
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['gastos'] })
            toast.success('Gasto eliminado')
        },
        onError: (error: any) => {
            toast.error('Error: ' + error.message)
        }
    })


    return {
        gastos,
        totalCount,
        stats,
        isLoading,
        updateExpense,
        createExpense,
        deleteExpense
    }
}
