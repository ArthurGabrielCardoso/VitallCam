'use client'

import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'

const REVEAL_CSS = `
@property --page-mask-r {
  syntax: '<percentage>';
  inherits: false;
  initial-value: 0%;
}
@keyframes pageRevealFromCenter {
  from { --page-mask-r: 0%; }
  to   { --page-mask-r: 160%; }
}
.page-reveal {
  animation: pageRevealFromCenter 0.55s ease-out forwards;
  -webkit-mask-image: radial-gradient(circle at 50% 50%, black var(--page-mask-r), transparent var(--page-mask-r));
          mask-image: radial-gradient(circle at 50% 50%, black var(--page-mask-r), transparent var(--page-mask-r));
}
`

/**
 * Wrapper que aplica uma animação de "revelar do centro para fora"
 * a cada troca de rota (path). Usa um @property + radial mask para
 * a transição, sem layout shift.
 */
export default function PageRevealTransition({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const [animKey, setAnimKey] = useState(pathname)

  useEffect(() => {
    if (document.head.querySelector('[data-page-reveal-css]')) return
    const el = document.createElement('style')
    el.setAttribute('data-page-reveal-css', '1')
    el.textContent = REVEAL_CSS
    document.head.appendChild(el)
  }, [])

  useEffect(() => {
    setAnimKey(pathname)
  }, [pathname])

  return (
    <div key={animKey} className="page-reveal">
      {children}
    </div>
  )
}
