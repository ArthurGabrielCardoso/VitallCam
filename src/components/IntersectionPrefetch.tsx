'use client'

import { useEffect, useRef } from 'react'
import { prefetchPatientData } from '@/lib/prefetch'

interface IntersectionPrefetchProps {
  patientId: string
  children: React.ReactNode
}

export default function IntersectionPrefetch({ patientId, children }: IntersectionPrefetchProps) {
  const elementRef = useRef<HTMLDivElement>(null)
  const hasPrefetched = useRef(false)

  useEffect(() => {
    const element = elementRef.current
    if (!element) return

    const observer = new IntersectionObserver(
      async (entries) => {
        const [entry] = entries
        if (entry.isIntersecting && !hasPrefetched.current) {
          hasPrefetched.current = true
          try {
            await prefetchPatientData(patientId)
          } catch {
            // Falha silenciosa no prefetch
          }
        }
      },
      {
        rootMargin: '50px', // Prefetch quando estiver 50px antes de aparecer
      }
    )

    observer.observe(element)

    return () => {
      observer.disconnect()
    }
  }, [patientId])

  return (
    <div ref={elementRef}>
      {children}
    </div>
  )
}