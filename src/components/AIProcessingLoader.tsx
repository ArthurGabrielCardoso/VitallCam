'use client'

import { useEffect, useState } from 'react'

interface AIProcessingLoaderProps {
  imageUrl?: string
}

export default function AIProcessingLoader({ imageUrl }: AIProcessingLoaderProps) {
  const [sliderPosition, setSliderPosition] = useState(0)

  useEffect(() => {
    const interval = setInterval(() => {
      setSliderPosition(prev => {
        // Vai de 0 a 100 e volta
        const next = prev + 2
        return next > 100 ? 0 : next
      })
    }, 30)

    return () => clearInterval(interval)
  }, [])

  return (
    <div className="fixed inset-0 bg-black z-50 flex flex-col items-center justify-center">
      {/* Imagem sendo analisada (se disponível) */}
      {imageUrl && (
        <div className="relative max-w-4xl w-full h-[70vh] flex items-center justify-center mb-8">
          <img
            src={imageUrl}
            alt="Processando"
            className="max-w-full max-h-full object-contain"
          />
          {/* Slider animado indo e voltando */}
          <div
            className="absolute top-0 bottom-0 w-1 bg-primary shadow-lg transition-all duration-100"
            style={{ left: `${sliderPosition}%` }}
          >
            {/* Handle do slider */}
            <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-8 h-8 bg-primary rounded-full shadow-xl border-2 border-white"></div>
          </div>
        </div>
      )}

      {/* Texto clean */}
      <div className="text-center">
        <p className="text-white text-2xl font-light tracking-wider">
          Transformando sorriso
        </p>
      </div>
    </div>
  )
}
