'use client'

import { useEffect, useState } from 'react'

export default function SplashScreen() {
  const [mounted, setMounted]   = useState(false)
  const [showText, setShowText] = useState(false)  // t=2s: text panel expands
  const [showTag,  setShowTag]  = useState(false)  // t=3.7s: tagline slides up
  const [fadeOut,  setFadeOut]  = useState(false)  // t=7.2s: fade begins
  const [hidden,   setHidden]   = useState(false)  // t=8.0s: unmount

  useEffect(() => {
    if (typeof window === 'undefined') return
    setMounted(true)

    const timers = [
      setTimeout(() => setShowText(true), 2000),  // icon held 2 s, then text expands right
      setTimeout(() => setShowTag(true),  3700),  // tagline 1.7 s after brand appears
      setTimeout(() => setFadeOut(true),  6200),  // ~3 s after tagline — 1s less total
      setTimeout(() => setHidden(true),   7200),  // unmount after fade
    ]
    return () => timers.forEach(clearTimeout)
  }, [])

  if (!mounted || hidden) return null

  return (
    <div
      className="fixed inset-0 z-[100] bg-white flex items-center justify-center"
      style={{
        opacity:   fadeOut ? 0    : 1,
        transform: fadeOut ? 'scale(1.07)' : 'scale(1)',
        filter:    fadeOut ? 'blur(14px)' : 'blur(0px)',
        transition: fadeOut
          ? 'opacity 1s cubic-bezier(0.4,0,1,1), transform 1s cubic-bezier(0.4,0,0.6,1), filter 1s ease'
          : undefined,
      }}
      aria-hidden
    >
      <div className="flex items-center">

        {/* ── Icon ───────────────────────────────────────────────────────
            While text is hidden (maxWidth=0, margin=0) the flex row is
            only as wide as the icon, so the parent justify-center puts
            the icon exactly in the middle of the viewport.             */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/icon.png"
          alt="VitallCam"
          className="splash-icon w-52 h-52 object-contain shrink-0"
        />

        {/* ── Text panel ─────────────────────────────────────────────────
            Expands to the right, pushing the icon left naturally.      */}
        <div
          style={{
            maxWidth:    showText ? '520px' : '0',
            marginLeft:  showText ? '40px'  : '0',
            opacity:     showText ? 1       : 0,
            overflow:    'hidden',
            transition: [
              'max-width   0.72s cubic-bezier(0.65,0,0.35,1)',
              'margin-left 0.72s cubic-bezier(0.65,0,0.35,1)',
              'opacity     0.45s ease 0.12s',
            ].join(', '),
          }}
        >
          <div className="flex flex-col" style={{ whiteSpace: 'nowrap' }}>

            {/* Brand */}
            <span
              className="text-7xl font-medium tracking-tight leading-none splash-brand-shimmer"
              style={{
                background: 'linear-gradient(90deg, #0f766e 0%, #0f766e 20%, #cca97e 50%, #0f766e 80%, #0f766e 100%)',
                backgroundSize: '300% auto',
                backgroundPosition: '100% center',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                backgroundClip: 'text',
              }}
            >
              VitallCam
            </span>

            {/* Tagline */}
            <span
              className="text-xl text-gray-400 font-medium mt-3 tracking-wide pl-4"
              style={{
                opacity:    showTag ? 1          : 0,
                transform:  showTag ? 'translateY(0)' : 'translateY(10px)',
                transition: 'opacity 0.6s ease, transform 0.6s ease',
              }}
            >
              Excelência em diagnóstico
            </span>

          </div>
        </div>
      </div>
    </div>
  )
}
