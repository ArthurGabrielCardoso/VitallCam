'use client'

import Link from 'next/link'
import { BarChart3, ChevronRight, ClipboardList, Download, MonitorSmartphone, Settings } from 'lucide-react'

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

/**
 * Instaladores que não moram no nosso servidor.
 *
 * O APK do RustDesk tem 68 MB — versão `universal`, com todas as arquiteturas
 * dentro. A TV box Aquário (Amlogic S905W2) é ARM 64-bit, então o `aarch64` de
 * 25 MB provavelmente serviria; mas ROM 32-bit em chip 64-bit é comum em box
 * barata, e uma instalação que falha na clínica custa mais que os 43 MB.
 *
 * Link direto pro release do GitHub em vez de servir daqui: 68 MB no repositório
 * pesariam em todo deploy da Vercel, pra um arquivo que se instala uma vez por
 * aparelho.
 */
const downloads = [
  {
    href: 'https://github.com/rustdesk/rustdesk/releases/download/1.4.9/rustdesk-1.4.9-universal-signed.apk',
    title: 'RustDesk para a TV box',
    description: 'Espelha o notebook da clínica na cadeira para abrir a tomografia no DentalSlice. Abra esta página na TV box e toque aqui. APK de 68 MB.',
    icon: MonitorSmartphone,
    tone: 'bg-teal-50 text-teal-700 border-teal-100',
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

        <h2 className="mb-3 mt-8 text-xs font-semibold uppercase tracking-wider text-gray-400">
          Downloads
        </h2>
        <div className="grid gap-4 sm:grid-cols-2">
          {downloads.map(({ href, title, description, icon: Icon, tone }) => (
            <a
              key={href}
              href={href}
              // Sai do nosso domínio: sem noreferrer o site de destino recebe de
              // onde o clique veio, e sem noopener ele ganharia window.opener.
              target="_blank"
              rel="noopener noreferrer"
              className="group flex min-h-40 items-start gap-4 rounded-2xl border border-gray-200 bg-white p-5 shadow-sm transition-all hover:-translate-y-0.5 hover:border-teal-300 hover:shadow-md"
            >
              <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border ${tone}`}>
                <Icon className="h-6 w-6" />
              </div>
              <div className="min-w-0 flex-1">
                <h3 className="text-base font-semibold text-gray-800">{title}</h3>
                <p className="mt-2 text-sm leading-6 text-gray-500">{description}</p>
              </div>
              <Download className="mt-4 h-5 w-5 shrink-0 text-gray-300 transition-colors group-hover:text-teal-600" />
            </a>
          ))}
        </div>
      </div>
    </div>
  )
}
