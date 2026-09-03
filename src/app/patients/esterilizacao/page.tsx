'use client'

import EsterilizacaoPanel from '@/components/EsterilizacaoPanel'

/**
 * A tela abre no que interessa.
 *
 * Tinha título, subtítulo com o número da RDC e uma seta de voltar. No celular
 * isso é meia tela de cabeçalho antes do primeiro dado — e quem chegou aqui veio
 * pela barra lateral, então já sabe onde está e como sair. O nome da norma vive
 * no livro de registro, que é onde ele serve para alguma coisa.
 */
export default function EsterilizacaoPage() {
  return (
    <div className="min-h-full bg-gray-50 p-4 sm:p-6">
      <div className="max-w-6xl mx-auto">
        <EsterilizacaoPanel />
      </div>
    </div>
  )
}
