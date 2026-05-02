'use client'

import { useEffect, useState } from 'react'

type Phase = 'pulse' | 'zoom' | 'exit'

export default function CameraTransition({ isDataReady }: { isDataReady: boolean }) {
  const [phase,    setPhase]    = useState<Phase>('pulse')
  const [hidden,   setHidden]   = useState(false)
  const [zoomDone, setZoomDone] = useState(false)
  const [scale,   setScale]   = useState(1)
  const [visible, setVisible] = useState(false)   // fade-in do ícone

  useEffect(() => {
    // Pulso suave: alterna 1 ↔ 1.09 a cada 900ms
    let up = true
    const pulse = setInterval(() => {
      setScale(up ? 1.09 : 1)
      up = !up
    }, 900)

    // t=2.2s: para pulso, inicia zoom
    const t1 = setTimeout(() => {
      clearInterval(pulse)
      setScale(42)
      setPhase('zoom')
    }, 2200)

    // t=2.8s: inicia exit 0.4s antes do zoom terminar (overlap suave)
    const t2 = setTimeout(() => setZoomDone(true), 2800)

    return () => { clearInterval(pulse); clearTimeout(t1); clearTimeout(t2) }
  }, [])

  // Exit começa imediatamente quando o zoom termina — sem esperar dados
  useEffect(() => {
    if (!zoomDone) return
    setPhase('exit')
    const t = setTimeout(() => setHidden(true), 1900)
    return () => clearTimeout(t)
  }, [zoomDone])

  if (hidden) return null

  const zooming = phase === 'zoom' || phase === 'exit'
  const exiting  = phase === 'exit'

  return (
    <div
      className={`fixed inset-0 z-[80] flex items-center justify-center overflow-hidden${exiting ? ' camera-reveal' : ''}`}
      style={{
        backgroundColor: '#ffffff',
        pointerEvents:   exiting ? 'none' : 'auto',
      }}
    >
      {/* Teal expande do centro durante o zoom */}
      {phase === 'zoom' && <div className="camera-teal-expand" />}

      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/icon.png"
        alt=""
        aria-hidden
        onLoad={() => setVisible(true)}
        style={{
          width:           176,
          height:          176,
          objectFit:       'contain',
          opacity:         exiting ? 0 : (visible ? 1 : 0),
          transformOrigin: '50% 42%',
          transform:       `scale(${scale})`,
          transition:      phase === 'zoom'
            ? 'transform 1s ease-in'
            : 'transform 0.85s ease-in-out, opacity 0.55s ease',
          position:        'relative',
          zIndex:          1,
        }}
      />
    </div>
  )
}
