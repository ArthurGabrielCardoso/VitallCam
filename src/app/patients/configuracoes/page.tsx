'use client'

import Link from 'next/link'
import { BarChart3, ChevronRight, ClipboardList, Settings } from 'lucide-react'

const options = [
  {
    href: '/patients/configuracoes/anamneses',
    title: 'Modelos de anamnese',
    description: 'Crie, edite e escolha o formulário padrão da clínica.',
    icon: ClipboardList,
    tone: 'bg-teal-50 text-teal-700 border-teal-100',
  },
  {
    href: '/patients/configuracoes/estatisticas',
    title: 'Estatísticas',
    description: 'Acompanhe sessões, tempo de captura, pacientes e quantidade de fotos.',
    icon: BarChart3,
    tone: 'bg-dourado-50 text-dourado-700 border-dourado-100',
  },
]

export default function ConfiguracoesPage() {
  return (
    <div className="min-h-full bg-gray-50 px-4 py-6 sm:p-8">
      <div className="mx-auto max-w-4xl">
        <div className="mb-7 flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-teal-700 text-white shadow-sm">
            <Settings className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold text-gray-800">Configurações</h1>
            <p className="text-sm text-gray-500">Personalize o funcionamento da VitallCam.</p>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          {options.map(({ href, title, description, icon: Icon, tone }) => (
            <Link
              key={href}
              href={href}
              className="group flex min-h-40 items-start gap-4 rounded-2xl border border-gray-200 bg-white p-5 shadow-sm transition-all hover:-translate-y-0.5 hover:border-teal-300 hover:shadow-md"
            >
              <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border ${tone}`}>
                <Icon className="h-6 w-6" />
              </div>
              <div className="min-w-0 flex-1">
                <h2 className="text-base font-semibold text-gray-800">{title}</h2>
                <p className="mt-2 text-sm leading-6 text-gray-500">{description}</p>
              </div>
              <ChevronRight className="mt-4 h-5 w-5 shrink-0 text-gray-300 transition-colors group-hover:text-teal-600" />
            </Link>
          ))}
        </div>
      </div>
    </div>
  )
}
