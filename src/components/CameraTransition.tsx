'use client'

import { useEffect, useState } from 'react'

// Injetado via JS para garantir que @property não seja removido pelo
// minificador CSS do Next.js em produção (cssnano strip @property)
const REVEAL_CSS = `
@property --mask-r {
  syntax: '<percentage>';
  inherits: false;
  initial-value: 0%;
}
@keyframes revealFromCenter {
  from { --mask-r: 0%;   }
  to   { --mask-r: 160%; }
}
.camera-reveal {
  animation: revealFromCenter 1.8s ease-out forwards !important;
  mask-image: radial-gradient(circle at 50% 50%, transparent var(--mask-r), black var(--mask-r)) !important;
  -webkit-mask-image: radial-gradient(circle at 50% 50%, transparent var(--mask-r), black var(--mask-r)) !important;
}
`

type Phase = 'pulse' | 'zoom' | 'exit'

export default function CameraTransition({ isDataReady }: { isDataReady: boolean }) {
  const [phase,    setPhase]    = useState<Phase>('pulse')
  const [hidden,   setHidden]   = useState(false)
  const [zoomDone, setZoomDone] = useState(false)
  const [scale,    setScale]    = useState(1)
  const [visible,  setVisible]  = useState(false)

  // Injeta o CSS no head para escapar do minificador de produção
  useEffect(() => {
    const el = document.createElement('style')
    el.setAttribute('data-camera-reveal', '1')
    el.textContent = REVEAL_CSS
    document.head.appendChild(el)
    return () => { document.head.removeChild(el) }
  }, [])

  useEffect(() => {
    let up = true
    const pulse = setInterval(() => {
      setScale(up ? 1.09 : 1)
      up = !up
    }, 900)

    const t1 = setTimeout(() => {
      clearInterval(pulse)
      setScale(42)
      setPhase('zoom')
    }, 2200)

    const t2 = setTimeout(() => setZoomDone(true), 3000)

    return () => { clearInterval(pulse); clearTimeout(t1); clearTimeout(t2) }
  }, [])

  useEffect(() => {
    if (!zoomDone) return
    setPhase('exit')
    const t = setTimeout(() => setHidden(true), 1900)
    return () => clearTimeout(t)
  }, [zoomDone])

  if (hidden) return null

  const exiting = phase === 'exit'

  return (
    <div
      className={`fixed inset-0 z-[80] flex items-center justify-center overflow-hidden${exiting ? ' camera-reveal' : ''}`}
      style={{
        backgroundColor: '#ffffff',
        pointerEvents:   exiting ? 'none' : 'auto',
      }}
    >
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
