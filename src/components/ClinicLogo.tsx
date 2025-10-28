'use client'

import { useState, useEffect } from 'react'
import Image from 'next/image'
import { Camera } from 'lucide-react'

interface ClinicLogoProps {
  className?: string
  fallbackIcon?: boolean
}

export default function ClinicLogo({ className = "w-10 h-10", fallbackIcon = true }: ClinicLogoProps) {
  const [logoExists, setLogoExists] = useState(false)
  const [logoPath, setLogoPath] = useState('')

  useEffect(() => {
    checkForLogo()
  }, [])

  const checkForLogo = async () => {
    const possiblePaths = [
      '/assets/images/logo.png',
      '/assets/images/logo.svg',
      '/assets/images/logo.jpg',
      '/assets/images/logo.jpeg',
      '/logo.png',
      '/logo.svg'
    ]

    for (const path of possiblePaths) {
      try {
        const response = await fetch(path, { method: 'HEAD' })
        if (response.ok) {
          setLogoPath(path)
          setLogoExists(true)
          return
        }
      } catch {
        // Continue to next path
      }
    }
  }

  if (logoExists && logoPath) {
    return (
      <div className={`relative ${className} bg-white rounded-lg overflow-hidden border border-border`}>
        <Image
          src={logoPath}
          alt="Logo da Clínica"
          fill
          className="object-contain p-1"
          sizes="40px"
        />
      </div>
    )
  }

  if (fallbackIcon) {
    return (
      <div className={`${className} bg-primary rounded-lg flex items-center justify-center`}>
        <Camera className="w-6 h-6 text-primary-foreground" />
      </div>
    )
  }

  return null
}