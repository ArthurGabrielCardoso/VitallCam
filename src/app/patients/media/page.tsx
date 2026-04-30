'use client'

import { ArrowLeft, Youtube, Music, Tv, Sparkles, Download } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'

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
  const [isAndroid, setIsAndroid] = useState(false)

  useEffect(() => {
    setIsAndroid(/android/i.test(navigator.userAgent))
  }, [])

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

      {/* Banner de download do APK */}
      <a
        href="/vitallcam-android.apk"
        download="VitallCam.apk"
        className={`fixed bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-3 px-6 py-4 rounded-2xl shadow-2xl transition-all z-50 ${
          isAndroid
            ? 'bg-green-500 hover:bg-green-400 text-white animate-pulse'
            : 'bg-white/10 hover:bg-white/20 backdrop-blur-sm text-white/80'
        }`}
      >
        <Download className="w-5 h-5" />
        <span className="font-semibold text-sm">
          {isAndroid ? 'Baixar App VitallCam para este tablet' : 'Download APK Android'}
        </span>
      </a>
    </div>
  )
}
