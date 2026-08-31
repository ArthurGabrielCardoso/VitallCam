'use client'

import { useRouter } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import EsterilizacaoPanel from '@/components/EsterilizacaoPanel'

export default function EsterilizacaoPage() {
  const router = useRouter()

  return (
    <div className="min-h-full bg-gray-50 p-4 sm:p-6">
      <div className="max-w-6xl mx-auto">
        <div className="flex items-center gap-3 mb-6">
          <button
            onClick={() => router.push('/patients')}
            className="h-9 w-9 flex items-center justify-center rounded border border-gray-200 bg-white text-gray-500 hover:text-teal-700 hover:border-teal-500 transition-colors"
            title="Voltar"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div>
            <h1 className="text-2xl font-semibold text-gray-700">Esterilização</h1>
            <p className="text-sm text-gray-400">
              Etiquetas de rastreabilidade dos ciclos da autoclave — RDC Anvisa 1.002/2025
            </p>
          </div>
        </div>

        <EsterilizacaoPanel />
      </div>
    </div>
  )
}
