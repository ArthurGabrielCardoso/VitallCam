'use client'

import { ArrowLeft, Youtube, Music, Tv, Sparkles, Smartphone, Download } from 'lucide-react'
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
    <div className="min-h-screen bg-gradient-to-br from-primary via-primary/90 to-primary/80 flex flex-col items-center justify-center p-6 gap-12">
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

      {/* Banner de download do APK Android */}
      <a
        href="/vitallcam-android.apk"
        download="VitallCam.apk"
        className={`flex items-center gap-4 px-8 py-5 rounded-2xl shadow-2xl transition-all hover:scale-105 border-2 ${
          isAndroid
            ? 'bg-green-500 hover:bg-green-400 border-green-300 animate-pulse-once'
            : 'bg-white/10 hover:bg-white/20 border-white/30'
        }`}
      >
        <div className="bg-white/20 rounded-xl p-3">
          <Smartphone className="w-8 h-8 text-white" />
        </div>
        <div className="text-left">
          <p className="text-white font-bold text-lg leading-tight">
            Instalar App Android
          </p>
          <p className="text-white/80 text-sm">
            Câmera USB via OTG no tablet
          </p>
        </div>
        <Download className="w-6 h-6 text-white/80 ml-2" />
      </a>
    </div>
  )
}
