'use client'

import { ArrowLeft, Youtube, Music, Tv, Sparkles } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'

const mediaServices = [
  {
    id: 'youtube',
    name: 'YouTube',
    url: 'https://www.youtube.com',
    icon: Youtube,
  },
  {
    id: 'spotify',
    name: 'Spotify',
    url: 'https://open.spotify.com',
    icon: Music,
  },
  {
    id: 'netflix',
    name: 'Netflix',
    url: 'https://www.netflix.com/browse',
    icon: Tv,
  },
  {
    id: 'disneyplus',
    name: 'Disney+',
    url: 'https://www.disneyplus.com',
    icon: Sparkles,
  },
]

export default function MediaPage() {
  const router = useRouter()

  const handleServiceClick = (service: typeof mediaServices[0]) => {
    // Salvar rota de retorno no localStorage
    if (typeof window !== 'undefined') {
      localStorage.setItem('vitallcam_return', '/patients/media')
    }
    // Redirecionar imediatamente para o serviço
    window.location.href = service.url
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary via-primary/90 to-primary/80 flex items-center justify-center p-6">
      {/* Botão Voltar */}
      <Link
        href="/patients"
        className="fixed top-6 left-6 z-50 bg-white/10 hover:bg-white/20 backdrop-blur-sm text-white p-3 rounded-full shadow-lg transition-all hover:scale-105"
      >
        <ArrowLeft className="w-6 h-6" />
      </Link>

      {/* Grid de Serviços Centralizado */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-8 max-w-4xl">
        {mediaServices.map((service) => {
          const Icon = service.icon
          return (
            <div key={service.id} className="flex flex-col items-center gap-4">
              <button
                onClick={() => handleServiceClick(service)}
                className="bg-white hover:bg-white/90 rounded-2xl shadow-2xl p-12 flex items-center justify-center transition-all hover:scale-105 cursor-pointer w-full"
              >
                <Icon className="w-16 h-16 text-primary" />
              </button>
              <span className="text-white font-semibold text-lg">
                {service.name}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
