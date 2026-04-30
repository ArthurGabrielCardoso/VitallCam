'use client'

import { useRef } from 'react'
import Image from 'next/image'
import { Anamnese } from '@/lib/types'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Calendar, FileText, Download } from 'lucide-react'
import { useToast } from '@/hooks/use-toast'

interface AnamneseDocumentProps {
  anamnese: Anamnese
}

// Ordem canônica das perguntas e seus rótulos legíveis
const QUESTION_ORDER: { key: string; label: string; subKeys?: { key: string; label: string }[] }[] = [
  {
    key: 'tratamentoMedico',
    label: '1. Está em tratamento médico?',
    subKeys: [
      { key: 'motivoTratamento', label: 'Motivo do tratamento' },
      { key: 'nomeMedico', label: 'Nome do médico' },
    ],
  },
  {
    key: 'medicamentoContinuo',
    label: '2. Faz uso de algum medicamento de forma contínua?',
    subKeys: [{ key: 'quaisMedicamentos', label: 'Quais medicamentos' }],
  },
  {
    key: 'medicamentosNaturais',
    label: '3. Faz uso de medicamentos naturais?',
    subKeys: [{ key: 'quaisMedicamentosNaturais', label: 'Quais' }],
  },
  {
    key: 'hospitalizado',
    label: '4. Já foi hospitalizado(a)?',
    subKeys: [{ key: 'motivoHospitalizacao', label: 'Motivo da hospitalização' }],
  },
  {
    key: 'gravida',
    label: '5. Está grávida?',
    subKeys: [{ key: 'periodoGestacional', label: 'Período gestacional' }],
  },
  {
    key: 'dieta',
    label: '6. Faz algum tipo de dieta?',
    subKeys: [
      { key: 'qualDieta', label: 'Qual dieta' },
      { key: 'medicamentoEmagrecer', label: 'Medicamento para emagrecer' },
    ],
  },
  {
    key: 'alergia',
    label: '7. Tem alguma alergia?',
    subKeys: [{ key: 'qualAlergia', label: 'Qual alergia' }],
  },
  {
    key: 'alteracaoCoagulacao',
    label: '8. Tem alterações na coagulação sanguínea?',
    subKeys: [{ key: 'qualAlteracaoCoagulacao', label: 'Qual alteração' }],
  },
  { key: 'febreReumatica', label: '9. Teve febre reumática?' },
  {
    key: 'doencaAutoimune',
    label: '10. Tem doença autoimune?',
    subKeys: [{ key: 'qualDoencaAutoimune', label: 'Qual doença' }],
  },
  {
    key: 'doencaRenalHepatica',
    label: '11. Tem doença renal ou hepática?',
    subKeys: [{ key: 'qualDoencaRenalHepatica', label: 'Qual doença' }],
  },
  {
    key: 'diabetes',
    label: '12. É diabético(a)?',
    subKeys: [{ key: 'tipoDiabetes', label: 'Tipo de diabetes' }],
  },
  {
    key: 'doencaCardiovascular',
    label: '13. Tem doença cardiovascular?',
    subKeys: [{ key: 'qualDoencaCardiovascular', label: 'Qual doença' }],
  },
  {
    key: 'hepatite',
    label: '14. Tem hepatite?',
    subKeys: [{ key: 'tipoHepatite', label: 'Tipo de hepatite' }],
  },
  { key: 'pressaoArterial', label: '15. Como é sua pressão arterial?' },
  {
    key: 'problemasRespiratorios',
    label: '16. Tem problemas respiratórios?',
    subKeys: [{ key: 'quaisProblemasRespiratorios', label: 'Quais problemas' }],
  },
  { key: 'gastriteUlcera', label: '17. Tem gastrite ou úlcera?' },
  {
    key: 'alteracoesNeurologicas',
    label: '18. Tem alterações neurológicas?',
    subKeys: [{ key: 'qualAlteracaoNeurologica', label: 'Qual alteração' }],
  },
  {
    key: 'condicaoPsicologica',
    label: '19. Tem alguma condição psicológica?',
    subKeys: [{ key: 'qualCondicaoPsicologica', label: 'Qual condição' }],
  },
  { key: 'hiv', label: '20. É portador(a) de HIV?' },
  {
    key: 'historicoDoencasFamiliares',
    label: '21. Há histórico de doenças na família?',
    subKeys: [{ key: 'quaisDoencasFamiliares', label: 'Quais doenças' }],
  },
  { key: 'tratamentoCancer', label: '22. Está em tratamento contra câncer?' },
  {
    key: 'fumante',
    label: '23. É fumante?',
    subKeys: [{ key: 'quantosCigarros', label: 'Quantidade de cigarros' }],
  },
  {
    key: 'drogas',
    label: '24. Faz uso de drogas?',
    subKeys: [{ key: 'quaisDrogas', label: 'Quais drogas' }],
  },
  { key: 'traumaFace', label: '25. Já sofreu trauma na face?' },
  {
    key: 'anestesiaOdontologica',
    label: '26. Já fez anestesia odontológica?',
    subKeys: [{ key: 'reacaoAnestesia', label: 'Reação à anestesia' }],
  },
  {
    key: 'outrasDoencas',
    label: '27. Tem outras doenças?',
    subKeys: [{ key: 'quaisOutrasDoencas', label: 'Quais doenças' }],
  },
  { key: 'motivoConsultaOpcao', label: 'Motivo da consulta' },
  { key: 'comoConheceuOpcao', label: 'Como nos conheceu' },
]

const formatValue = (value: string) => {
  if (value === 'sim') return 'Sim'
  if (value === 'nao') return 'Não'
  return value.charAt(0).toUpperCase() + value.slice(1)
}

export default function AnamneseDocument({ anamnese }: AnamneseDocumentProps) {
  const printRef = useRef<HTMLDivElement>(null)
  const { toast } = useToast()
  const dados = anamnese.dados_saude as Record<string, any>

  const handleDownloadPDF = async () => {
    try {
      const { default: jsPDF } = await import('jspdf')
      const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })

      const pageW = doc.internal.pageSize.getWidth()
      const margin = 15
      const contentW = pageW - margin * 2
      let y = 20

      const checkNewPage = (needed: number) => {
        if (y + needed > 270) {
          doc.addPage()
          y = 20
        }
      }

      // Título
      doc.setFontSize(16)
      doc.setFont('helvetica', 'bold')
      doc.text('FICHA DE ANAMNESE', pageW / 2, y, { align: 'center' })
      y += 8

      doc.setFontSize(10)
      doc.setFont('helvetica', 'normal')
      doc.text(
        `Data: ${new Date(anamnese.created_at).toLocaleDateString('pt-BR')}`,
        pageW / 2,
        y,
        { align: 'center' }
      )
      y += 10

      // Linha separadora
      doc.setDrawColor(29, 185, 179)
      doc.setLineWidth(0.5)
      doc.line(margin, y, pageW - margin, y)
      y += 8

      // Dados pessoais
      doc.setFontSize(12)
      doc.setFont('helvetica', 'bold')
      doc.text('DADOS PESSOAIS', margin, y)
      y += 7

      const pessoais = [
        ['Nome', anamnese.nome],
        anamnese.endereco ? ['Endereço', anamnese.endereco] : null,
        anamnese.telefone ? ['Telefone', anamnese.telefone] : null,
        anamnese.email ? ['E-mail', anamnese.email] : null,
        anamnese.instagram ? ['Instagram', anamnese.instagram] : null,
      ].filter(Boolean) as [string, string][]

      doc.setFontSize(10)
      for (const [label, value] of pessoais) {
        checkNewPage(6)
        doc.setFont('helvetica', 'bold')
        doc.text(`${label}:`, margin, y)
        doc.setFont('helvetica', 'normal')
        doc.text(value, margin + 30, y)
        y += 6
      }

      y += 4
      doc.setDrawColor(200, 200, 200)
      doc.line(margin, y, pageW - margin, y)
      y += 8

      // Perguntas de saúde
      doc.setFontSize(12)
      doc.setFont('helvetica', 'bold')
      doc.text('INFORMAÇÕES DE SAÚDE', margin, y)
      y += 8

      for (const question of QUESTION_ORDER) {
        const answer = dados[question.key]
        if (!answer) continue

        checkNewPage(12)
        doc.setFontSize(10)
        doc.setFont('helvetica', 'bold')
        const labelLines = doc.splitTextToSize(question.label, contentW)
        doc.text(labelLines, margin, y)
        y += labelLines.length * 5

        doc.setFont('helvetica', 'normal')
        doc.text(`Resposta: ${formatValue(answer)}`, margin + 4, y)
        y += 6

        if (question.subKeys && answer === 'sim') {
          for (const sub of question.subKeys) {
            const subVal = dados[sub.key]
            if (!subVal) continue
            checkNewPage(6)
            doc.setFont('helvetica', 'italic')
            const subLine = `  ${sub.label}: ${subVal}`
            const subLines = doc.splitTextToSize(subLine, contentW - 8)
            doc.text(subLines, margin + 8, y)
            y += subLines.length * 5
          }
        }
        y += 2
      }

      // Assinatura
      if (anamnese.assinatura) {
        checkNewPage(40)
        y += 4
        doc.setDrawColor(200, 200, 200)
        doc.line(margin, y, pageW - margin, y)
        y += 8
        doc.setFontSize(10)
        doc.setFont('helvetica', 'bold')
        doc.text('ASSINATURA DO PACIENTE', margin, y)
        y += 6
        doc.addImage(anamnese.assinatura, 'PNG', margin, y, 60, 25)
        y += 30
      }

      // Rodapé
      const pageCount = (doc.internal as any).pages?.length - 1 || 1
      for (let i = 1; i <= pageCount; i++) {
        doc.setPage(i)
        doc.setFontSize(8)
        doc.setFont('helvetica', 'normal')
        doc.setTextColor(150)
        doc.text(
          `Gerado em ${new Date(anamnese.created_at).toLocaleString('pt-BR')} — Página ${i}/${pageCount}`,
          pageW / 2,
          290,
          { align: 'center' }
        )
        doc.setTextColor(0)
      }

      doc.save(`Anamnese_${anamnese.nome.replace(/\s+/g, '_')}_${new Date(anamnese.created_at).toLocaleDateString('pt-BR').replace(/\//g, '-')}.pdf`)

      toast({ title: 'PDF gerado com sucesso!' })
    } catch (err) {
      console.error(err)
      toast({ variant: 'destructive', title: 'Erro ao gerar PDF' })
    }
  }

  return (
    <div className="w-full max-w-4xl mx-auto">
      {/* Cabeçalho */}
      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <FileText className="w-8 h-8 text-primary" />
          <div>
            <h2 className="text-2xl font-bold text-gray-900">Ficha de Anamnese</h2>
            <span className="flex items-center gap-1 text-sm text-gray-600 mt-1">
              <Calendar className="w-4 h-4" />
              {new Date(anamnese.created_at).toLocaleDateString('pt-BR', {
                day: '2-digit',
                month: 'long',
                year: 'numeric',
              })}
            </span>
          </div>
        </div>
        <Button onClick={handleDownloadPDF} className="bg-primary hover:bg-primary/90 text-white flex items-center gap-2">
          <Download className="w-4 h-4" />
          Salvar PDF
        </Button>
      </div>

      {/* Documento */}
      <Card className="shadow-lg" ref={printRef}>
        <CardContent className="p-8 sm:p-12">
          {/* Logo */}
          <div className="mb-8 text-center border-b pb-6">
            <Image src="/assets/images/logo.png" alt="Logo" width={150} height={75} className="mx-auto object-contain" />
          </div>

          {/* Dados Pessoais */}
          <section className="mb-8">
            <h3 className="text-lg font-bold text-primary mb-4 uppercase tracking-wide border-b pb-2">Dados Pessoais</h3>
            <dl className="space-y-2">
              {[
                ['Nome', anamnese.nome],
                anamnese.endereco ? ['Endereço', anamnese.endereco] : null,
                anamnese.telefone ? ['Telefone', anamnese.telefone] : null,
                anamnese.telefone_auxiliar ? ['Telefone Auxiliar', anamnese.telefone_auxiliar] : null,
                anamnese.email ? ['E-mail', anamnese.email] : null,
                anamnese.instagram ? ['Instagram', anamnese.instagram] : null,
              ]
                .filter(Boolean)
                .map(([label, value], i) => (
                  <div key={i} className="flex gap-2 text-sm">
                    <dt className="font-semibold text-gray-700 min-w-[130px]">{label}:</dt>
                    <dd className="text-gray-800">{value as string}</dd>
                  </div>
                ))}
            </dl>
          </section>

          {/* Informações de Saúde */}
          <section className="mb-8">
            <h3 className="text-lg font-bold text-primary mb-4 uppercase tracking-wide border-b pb-2">
              Informações de Saúde
            </h3>
            <div className="space-y-4">
              {QUESTION_ORDER.map((question) => {
                const answer = dados[question.key]
                if (!answer) return null
                return (
                  <div key={question.key} className="border-b border-gray-100 pb-3 last:border-0">
                    <p className="font-semibold text-gray-800 text-sm">{question.label}</p>
                    <p className="text-gray-700 text-sm mt-1 pl-2">
                      <span className="font-medium">Resposta:</span> {formatValue(answer)}
                    </p>
                    {question.subKeys && answer === 'sim' &&
                      question.subKeys.map((sub) => {
                        const subVal = dados[sub.key]
                        if (!subVal) return null
                        return (
                          <p key={sub.key} className="text-gray-600 text-sm mt-1 pl-4">
                            <span className="font-medium">{sub.label}:</span> {subVal}
                          </p>
                        )
                      })}
                  </div>
                )
              })}
            </div>
          </section>

          {/* Assinatura */}
          {anamnese.assinatura && (
            <div className="mt-8 pt-6 border-t border-gray-200 text-center">
              <p className="text-sm text-gray-600 mb-3 font-medium">Assinatura do Paciente:</p>
              <div className="border border-gray-300 rounded-lg p-3 bg-white inline-block">
                <img src={anamnese.assinatura} alt="Assinatura" className="max-w-xs h-24 object-contain" />
              </div>
            </div>
          )}

          {/* Rodapé */}
          <div className="mt-10 pt-4 border-t border-gray-200 flex items-center justify-between text-xs text-gray-500">
            <span>Gerado em {new Date(anamnese.created_at).toLocaleString('pt-BR')}</span>
            <span className="px-2 py-1 rounded-full bg-green-100 text-green-700">Completa</span>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
