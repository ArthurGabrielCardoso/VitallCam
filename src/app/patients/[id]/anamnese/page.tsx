"use client"

export const dynamic = 'force-dynamic'

import { useState, useRef, useEffect } from "react"
import Image from "next/image"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { useToast } from "@/hooks/use-toast"
import SignatureCanvas from "react-signature-canvas"
import { CheckCircle2, AlertCircle } from "lucide-react"
import { useRouter, useParams } from "next/navigation"
import { supabase } from "@/lib/supabase"

// Importamos as bibliotecas diretamente (sem dynamic import)
import jsPDF from "jspdf"

export default function AnamneseForm() {
  const { toast } = useToast()
  const router = useRouter()
  const params = useParams()
  const patientId = params.id as string
  const [step, setStep] = useState(0)
  const [isGeneratingPDF, setIsGeneratingPDF] = useState(false)
  const [isSubmitSuccess, setIsSubmitSuccess] = useState(false)
  const [signatureRef] = useState(useRef<SignatureCanvas>(null))
  const [greeting, setGreeting] = useState("")
  const [timeOfDay, setTimeOfDay] = useState("")
  const [errors, setErrors] = useState<string[]>([])

  // Determine greeting based on time of day
  useEffect(() => {
    const hour = new Date().getHours()
    if (hour >= 5 && hour < 12) {
      setGreeting("Excelente dia")
      setTimeOfDay("dia")
    } else if (hour >= 12 && hour < 18) {
      setGreeting("Excelente tarde")
      setTimeOfDay("tarde")
    } else {
      setGreeting("Excelente noite")
      setTimeOfDay("noite")
    }
  }, [])

  // Buscar nome do paciente e preencher automaticamente
  useEffect(() => {
    const fetchPatient = async () => {
      try {
        const { data, error } = await supabase
          .from('patients')
          .select('name')
          .eq('id', patientId)
          .single<{ name: string }>()

        if (error) throw error

        if (data) {
          setFormData(prev => ({
            ...prev,
            nome: data.name
          }))
        }
      } catch (error) {
        console.error('Erro ao buscar paciente:', error)
      }
    }

    if (patientId) {
      fetchPatient()
    }
  }, [patientId])

  const [formData, setFormData] = useState({
    // Dados pessoais
    nome: "",
    endereco: "",
    telefone: "",
    telefoneAuxiliar: "",
    email: "",
    possuiInstagram: "",
    instagram: "@",

    // Perguntas de anamnese (1-28)
    tratamentoMedico: "",
    motivoTratamento: "",
    nomeMedico: "",

    medicamentoContinuo: "",
    quaisMedicamentos: "",

    medicamentosNaturais: "",
    quaisMedicamentosNaturais: "",

    hospitalizado: "",
    motivoHospitalizacao: "",

    gravida: "",
    periodoGestacional: "",

    dieta: "",
    qualDieta: "",
    medicamentoEmagrecer: "",

    alergia: "",
    qualAlergia: "",

    alteracaoCoagulacao: "",
    qualAlteracaoCoagulacao: "",

    febreReumatica: "",

    doencaAutoimune: "",
    qualDoencaAutoimune: "",

    doencaRenalHepatica: "",
    qualDoencaRenalHepatica: "",

    diabetes: "",
    tipoDiabetes: "",

    doencaCardiovascular: "",
    qualDoencaCardiovascular: "",

    hepatite: "",
    tipoHepatite: "",

    pressaoArterial: "",

    problemasRespiratorios: "",
    quaisProblemasRespiratorios: "",

    gastriteUlcera: "",

    alteracoesNeurologicas: "",
    qualAlteracaoNeurologica: "",

    condicaoPsicologica: "",
    qualCondicaoPsicologica: "",

    hiv: "",

    historicoDoencasFamiliares: "",
    quaisDoencasFamiliares: "",

    tratamentoCancer: "",

    fumante: "",
    quantosCigarros: "",

    drogas: "",
    quaisDrogas: "",

    anestesiaOdontologica: "",
    reacaoAnestesia: "",

    traumaFace: "",

    outrasDoencas: "",
    quaisOutrasDoencas: "",

    // Modificar estas propriedades
    motivoConsulta: "",
    motivoConsultaOutros: "",
    motivoConsultaOpcao: "",

    comoConheceu: "",
    comoConheceuOutros: "",
    comoConheceuOpcao: "",

    // Assinatura
    assinatura: "",
  })

  const totalSteps = 4 // Introdução, Perguntas 1-14, Perguntas 15-28, Assinatura

  // Função para formatar telefone
  const formatPhoneNumber = (value: string) => {
    // Remove todos os caracteres não numéricos
    const numbers = value.replace(/\D/g, "")

    // Aplica a máscara conforme a quantidade de dígitos
    if (numbers.length <= 2) {
      return `(${numbers}`
    } else if (numbers.length <= 6) {
      return `(${numbers.slice(0, 2)}) ${numbers.slice(2)}`
    } else if (numbers.length <= 10) {
      return `(${numbers.slice(0, 2)}) ${numbers.slice(2, 6)}-${numbers.slice(6)}`
    } else {
      return `(${numbers.slice(0, 2)}) ${numbers.slice(2, 7)}-${numbers.slice(7, 11)}`
    }
  }

  // Função para formatar Instagram
  const formatInstagram = (value: string) => {
    // Garante que sempre comece com @
    if (!value.startsWith("@")) {
      value = "@" + value
    }
    // Converte para minúsculas
    return value.toLowerCase()
  }

  const handleInputChange = (field: string, value: string) => {
    // Aplicar formatações específicas para certos campos
    if (field === "telefone" || field === "telefoneAuxiliar") {
      value = formatPhoneNumber(value)
    } else if (field === "instagram") {
      value = formatInstagram(value)
    } else if (field === "email") {
      // Não precisa de formatação especial, o tipo "email" do input já ajuda
    }

    setFormData({ ...formData, [field]: value })
  }

  const handleRadioChange = (field: string, value: string) => {
    setFormData({ ...formData, [field]: value })
  }

  // Função para validar email
  const isValidEmail = (email: string) => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    return emailRegex.test(email)
  }

  // Função para validar a etapa atual
  const validateCurrentStep = (): boolean => {
    const newErrors: string[] = []

    switch (step) {
      case 0: // Introdução - não precisa de validação
        break

      case 1: // Perguntas 1-14
        if (!formData.tratamentoMedico) newErrors.push("Pergunta 1 não respondida")
        if (formData.tratamentoMedico === "sim" && !formData.motivoTratamento)
          newErrors.push("Motivo do tratamento é obrigatório")
        if (formData.tratamentoMedico === "sim" && !formData.nomeMedico) newErrors.push("Nome do médico é obrigatório")

        if (!formData.medicamentoContinuo) newErrors.push("Pergunta 2 não respondida")
        if (formData.medicamentoContinuo === "sim" && !formData.quaisMedicamentos)
          newErrors.push("Informe quais medicamentos")

        if (!formData.medicamentosNaturais) newErrors.push("Pergunta sobre medicamentos naturais não respondida")
        if (formData.medicamentosNaturais === "sim" && !formData.quaisMedicamentosNaturais)
          newErrors.push("Informe quais medicamentos naturais")

        if (!formData.hospitalizado) newErrors.push("Pergunta 4 não respondida")
        if (formData.hospitalizado === "sim" && !formData.motivoHospitalizacao)
          newErrors.push("Motivo da hospitalização é obrigatório")

        if (!formData.gravida) newErrors.push("Pergunta 5 não respondida")
        if (formData.gravida === "sim" && !formData.periodoGestacional)
          newErrors.push("Período gestacional é obrigatório")

        if (!formData.dieta) newErrors.push("Pergunta 6 não respondida")
        if (formData.dieta === "sim" && !formData.qualDieta) newErrors.push("Informe qual dieta")

        if (!formData.alergia) newErrors.push("Pergunta 7 não respondida")
        if (formData.alergia === "sim" && !formData.qualAlergia) newErrors.push("Informe qual alergia")

        if (!formData.alteracaoCoagulacao) newErrors.push("Pergunta 8 não respondida")
        if (formData.alteracaoCoagulacao === "sim" && !formData.qualAlteracaoCoagulacao)
          newErrors.push("Informe qual alteração na coagulação")

        if (!formData.febreReumatica) newErrors.push("Pergunta 9 não respondida")

        if (!formData.doencaAutoimune) newErrors.push("Pergunta 10 não respondida")
        if (formData.doencaAutoimune === "sim" && !formData.qualDoencaAutoimune)
          newErrors.push("Informe qual doença autoimune")

        if (!formData.doencaRenalHepatica) newErrors.push("Pergunta 11 não respondida")
        if (formData.doencaRenalHepatica === "sim" && !formData.qualDoencaRenalHepatica)
          newErrors.push("Informe qual doença renal/hepática")

        if (!formData.diabetes) newErrors.push("Pergunta 12 não respondida")
        if (formData.diabetes === "sim" && !formData.tipoDiabetes) newErrors.push("Informe o tipo de diabetes")

        if (!formData.doencaCardiovascular) newErrors.push("Pergunta 13 não respondida")
        if (formData.doencaCardiovascular === "sim" && !formData.qualDoencaCardiovascular)
          newErrors.push("Informe qual doença cardiovascular")

        if (!formData.hepatite) newErrors.push("Pergunta 14 não respondida")
        if (formData.hepatite === "sim" && !formData.tipoHepatite) newErrors.push("Informe o tipo de hepatite")

        if (!formData.pressaoArterial) newErrors.push("Pergunta 15 não respondida")
        break

      case 2: // Perguntas 15-28
        if (!formData.problemasRespiratorios) newErrors.push("Pergunta 16 não respondida")
        if (formData.problemasRespiratorios === "sim" && !formData.quaisProblemasRespiratorios)
          newErrors.push("Informe quais problemas respiratórios")

        if (!formData.gastriteUlcera) newErrors.push("Pergunta 17 não respondida")

        if (!formData.alteracoesNeurologicas) newErrors.push("Pergunta 18 não respondida")
        if (formData.alteracoesNeurologicas === "sim" && !formData.qualAlteracaoNeurologica)
          newErrors.push("Informe qual alteração neurológica")

        if (!formData.condicaoPsicologica) newErrors.push("Pergunta 19 não respondida")
        if (formData.condicaoPsicologica === "sim" && !formData.qualCondicaoPsicologica)
          newErrors.push("Informe qual condição psicológica")

        if (!formData.hiv) newErrors.push("Pergunta 20 não respondida")

        if (!formData.historicoDoencasFamiliares) newErrors.push("Pergunta 21 não respondida")
        if (formData.historicoDoencasFamiliares === "sim" && !formData.quaisDoencasFamiliares)
          newErrors.push("Informe quais doenças familiares")

        if (!formData.tratamentoCancer) newErrors.push("Pergunta 22 não respondida")

        if (!formData.fumante) newErrors.push("Pergunta 23 não respondida")
        if (formData.fumante === "sim" && !formData.quantosCigarros) newErrors.push("Informe a quantidade de cigarros")

        if (!formData.drogas) newErrors.push("Pergunta 24 não respondida")
        if (formData.drogas === "sim" && !formData.quaisDrogas) newErrors.push("Informe quais drogas")

        if (!formData.anestesiaOdontologica) newErrors.push("Pergunta 25 não respondida")
        if (formData.anestesiaOdontologica === "sim" && !formData.reacaoAnestesia)
          newErrors.push("Informe a reação à anestesia")

        if (!formData.traumaFace) newErrors.push("Pergunta 26 não respondida")

        if (!formData.outrasDoencas) newErrors.push("Pergunta 27 não respondida")
        if (formData.outrasDoencas === "sim" && !formData.quaisOutrasDoencas)
          newErrors.push("Informe quais outras doenças")

        if (!formData.motivoConsultaOpcao) newErrors.push("Motivo da consulta é obrigatório")
        if (formData.motivoConsultaOpcao === "outros" && !formData.motivoConsultaOutros)
          newErrors.push("Motivo da consulta é obrigatório")

        if (!formData.comoConheceuOpcao) newErrors.push("Como nos conheceu é obrigatório")
        if (formData.comoConheceuOpcao === "outros" && !formData.comoConheceuOutros)
          newErrors.push("Como nos conheceu é obrigatório")
        break

      case 3: // Assinatura - validada no momento de gerar o PDF
        break
    }

    setErrors(newErrors)
    return newErrors.length === 0
  }

  // Função para avançar para a próxima etapa
  const handleNext = () => {
    if (validateCurrentStep()) {
      if (step < totalSteps - 1) {
        setStep(step + 1)
        window.scrollTo(0, 0)
        setErrors([])
      }
    } else {
      // Mostrar toast com erro
      toast({
        title: "Por favor, preencha todos os campos obrigatórios",
        description: "Todos os campos são importantes para seu atendimento odontológico.",
        variant: "destructive",
      })
      // Rolar até o primeiro erro
      const firstErrorElement = document.querySelector(".error-highlight")
      if (firstErrorElement) {
        firstErrorElement.scrollIntoView({ behavior: "smooth", block: "center" })
      }
    }
  }

  // Função para voltar para a etapa anterior
  const handlePrevious = () => {
    if (step > 0) {
      setStep(step - 1)
      window.scrollTo(0, 0)
      setErrors([])
    }
  }

  // Função para limpar a assinatura
  const clearSignature = () => {
    if (signatureRef.current) {
      signatureRef.current.clear()
    }
  }

  // Função para gerar e baixar o PDF
  const generatePDF = async () => {
    if (signatureRef.current && signatureRef.current.isEmpty()) {
      toast({
        title: "Assinatura necessária",
        description: "Por favor, assine o formulário antes de finalizar.",
        variant: "destructive",
      })
      return
    }

    setIsGeneratingPDF(true)

    try {
      // Capturar a assinatura como uma imagem base64
      let assinaturaBase64 = ""
      if (signatureRef.current && !signatureRef.current.isEmpty()) {
        const canvas = signatureRef.current.getCanvas()
        assinaturaBase64 = canvas.toDataURL("image/png")
      }

      if (!assinaturaBase64) {
        toast({
          title: "Erro ao capturar assinatura",
          description: "Não foi possível processar sua assinatura. Por favor, tente novamente.",
          variant: "destructive",
        })
        setIsGeneratingPDF(false)
        return
      }

      // Atualizar o estado com a assinatura
      const updatedFormData = {
        ...formData,
        assinatura: assinaturaBase64,
      }

      setFormData(updatedFormData)

      // Salvar os dados no localStorage para referência futura
      localStorage.setItem("anamneseData", JSON.stringify(updatedFormData))

      // Abordagem simplificada: criar PDF diretamente sem usar html2canvas
      const pdf = new jsPDF({
        orientation: "portrait",
        unit: "mm",
        format: "a4",
      })

      // Adicionar título
      pdf.setFontSize(18)
      pdf.setTextColor(29, 185, 179) // Cor primária #1db9b3
      pdf.text("VITALL CHECK-UP", 105, 20, { align: "center" })
      pdf.text("ANAMNESE CLÍNICA", 105, 30, { align: "center" })

      pdf.setFontSize(12)
      pdf.setTextColor(0, 0, 0)
      pdf.text(`Data: ${new Date().toLocaleDateString("pt-BR")}`, 105, 40, { align: "center" })

      // Linha separadora
      pdf.setDrawColor(29, 185, 179)
      pdf.line(20, 45, 190, 45)

      // Dados pessoais
      pdf.setFontSize(14)
      pdf.setTextColor(29, 185, 179)
      pdf.text("Dados Pessoais", 20, 55)

      pdf.setFontSize(12)
      pdf.setTextColor(0, 0, 0)
      pdf.text(`Nome: ${updatedFormData.nome}`, 20, 65)

      // Ajustar a posição inicial para o Histórico Médico, já que removemos os outros campos
      let yPos = 85 // Reduzido de 115 para 85

      // Histórico Médico (primeiras perguntas)
      pdf.setFontSize(14)
      pdf.setTextColor(29, 185, 179)
      pdf.text("Histórico Médico", 20, yPos)

      pdf.setFontSize(12)
      pdf.setTextColor(0, 0, 0)

      yPos += 10 // Incrementa a posição para começar a adicionar as perguntas

      // Função para adicionar perguntas e respostas
      const addQuestion = (question: string, answer: string, details?: string) => {
        // Verificar se precisa adicionar nova página
        // Calculamos o espaço necessário para a pergunta
        let neededSpace = 7 // Altura básica para a pergunta
        if (answer === "Sim") neededSpace += 7 // Altura para a resposta
        if (details) neededSpace += 6 // Altura para os detalhes
        neededSpace += 10 // Espaço entre perguntas

        // Se não houver espaço suficiente, adicionar nova página
        if (yPos + neededSpace > 270) {
          pdf.addPage()
          yPos = 20
        }

        pdf.setFontSize(11)
        pdf.text(question, 20, yPos)
        yPos += 7

        pdf.setFontSize(10)
        if (answer === "Sim") {
          pdf.setTextColor(200, 157, 104) // Cor secundária #c89d68
          pdf.text(answer, 25, yPos)
          pdf.setTextColor(0, 0, 0)
        } else {
          pdf.text(answer, 25, yPos)
        }

        if (details) {
          yPos += 6
          pdf.text(details, 30, yPos)
        }

        yPos += 10
      }

      // Adicionar perguntas e respostas
      addQuestion(
        "1. Está em tratamento médico?",
        updatedFormData.tratamentoMedico === "sim" ? "Sim" : "Não",
        updatedFormData.tratamentoMedico === "sim"
          ? `Motivo: ${updatedFormData.motivoTratamento || "Não informado"}, Médico: ${updatedFormData.nomeMedico || "Não informado"}`
          : undefined,
      )

      addQuestion(
        "2. Faz uso de medicamento contínuo?",
        updatedFormData.medicamentoContinuo === "sim" ? "Sim" : "Não",
        updatedFormData.medicamentoContinuo === "sim"
          ? `Quais: ${updatedFormData.quaisMedicamentos || "Não informado"}`
          : undefined,
      )

      addQuestion(
        "3. Faz uso de medicamentos naturais?",
        updatedFormData.medicamentosNaturais === "sim" ? "Sim" : "Não",
        updatedFormData.medicamentosNaturais === "sim"
          ? `Quais: ${updatedFormData.quaisMedicamentosNaturais || "Não informado"}`
          : undefined,
      )

      addQuestion(
        "4. Já foi hospitalizado(a)?",
        updatedFormData.hospitalizado === "sim" ? "Sim" : "Não",
        updatedFormData.hospitalizado === "sim"
          ? `Motivo: ${updatedFormData.motivoHospitalizacao || "Não informado"}`
          : undefined,
      )

      addQuestion(
        "5. Está grávida?",
        updatedFormData.gravida === "sim" ? "Sim" : "Não",
        updatedFormData.gravida === "sim"
          ? `Período gestacional: ${updatedFormData.periodoGestacional || "Não informado"}`
          : undefined,
      )

      addQuestion(
        "6. Está fazendo dieta?",
        updatedFormData.dieta === "sim" ? "Sim" : "Não",
        updatedFormData.dieta === "sim"
          ? `Qual dieta: ${updatedFormData.qualDieta || "Não informado"}, Medicamento para emagrecer: ${updatedFormData.medicamentoEmagrecer || "Não informado"}`
          : undefined,
      )

      addQuestion(
        "7. Possui alguma alergia?",
        updatedFormData.alergia === "sim" ? "Sim" : "Não",
        updatedFormData.alergia === "sim" ? `Qual: ${updatedFormData.qualAlergia || "Não informado"}` : undefined,
      )

      addQuestion(
        "8. Possui alterações na coagulação do sangue?",
        updatedFormData.alteracaoCoagulacao === "sim" ? "Sim" : "Não",
        updatedFormData.alteracaoCoagulacao === "sim"
          ? `Qual: ${updatedFormData.qualAlteracaoCoagulacao || "Não informado"}`
          : undefined,
      )

      addQuestion("9. Já teve febre reumática?", updatedFormData.febreReumatica === "sim" ? "Sim" : "Não")

      addQuestion(
        "10. Possui doença autoimune?",
        updatedFormData.doencaAutoimune === "sim" ? "Sim" : "Não",
        updatedFormData.doencaAutoimune === "sim"
          ? `Qual: ${updatedFormData.qualDoencaAutoimune || "Não informado"}`
          : undefined,
      )

      addQuestion(
        "11. Possui doença renal ou hepática?",
        updatedFormData.doencaRenalHepatica === "sim" ? "Sim" : "Não",
        updatedFormData.doencaRenalHepatica === "sim"
          ? `Qual: ${updatedFormData.qualDoencaRenalHepatica || "Não informado"}`
          : undefined,
      )

      addQuestion(
        "12. Possui diabetes?",
        updatedFormData.diabetes === "sim" ? "Sim" : "Não",
        updatedFormData.diabetes === "sim" ? `Tipo: ${updatedFormData.tipoDiabetes || "Não informado"}` : undefined,
      )

      addQuestion(
        "13. Possui doença cardiovascular?",
        updatedFormData.doencaCardiovascular === "sim" ? "Sim" : "Não",
        updatedFormData.doencaCardiovascular === "sim"
          ? `Qual: ${updatedFormData.qualDoencaCardiovascular || "Não informado"}`
          : undefined,
      )

      addQuestion(
        "14. Tem/Teve hepatite?",
        updatedFormData.hepatite === "sim" ? "Sim" : "Não",
        updatedFormData.hepatite === "sim" ? `Tipo: ${updatedFormData.tipoHepatite || "Não informado"}` : undefined,
      )

      addQuestion(
        "15. Pressão arterial:",
        updatedFormData.pressaoArterial === "normal"
          ? "Normal"
          : updatedFormData.pressaoArterial === "alta"
            ? "Alta"
            : updatedFormData.pressaoArterial === "baixa"
              ? "Baixa"
              : "Não informado",
      )

      // Continuando com as perguntas 15-28 sem forçar nova página
      addQuestion(
        "16. Problemas respiratórios?",
        updatedFormData.problemasRespiratorios === "sim" ? "Sim" : "Não",
        updatedFormData.problemasRespiratorios === "sim"
          ? `Quais: ${updatedFormData.quaisProblemasRespiratorios || "Não informado"}`
          : undefined,
      )

      addQuestion("17. Possui gastrite ou úlcera gástrica?", updatedFormData.gastriteUlcera === "sim" ? "Sim" : "Não")

      addQuestion(
        "18. Possui alterações neurológicas?",
        updatedFormData.alteracoesNeurologicas === "sim" ? "Sim" : "Não",
        updatedFormData.alteracoesNeurologicas === "sim"
          ? `Qual: ${updatedFormData.qualAlteracaoNeurologica || "Não informado"}`
          : undefined,
      )

      addQuestion(
        "19. Possui condição psicológica ou psiquiátrica?",
        updatedFormData.condicaoPsicologica === "sim" ? "Sim" : "Não",
        updatedFormData.condicaoPsicologica === "sim"
          ? `Qual: ${updatedFormData.qualCondicaoPsicologica || "Não informado"}`
          : undefined,
      )

      addQuestion("20. Você vive com HIV?", updatedFormData.hiv === "sim" ? "Sim" : "Não")

      addQuestion(
        "21. Apresenta histórico de doenças familiares?",
        updatedFormData.historicoDoencasFamiliares === "sim" ? "Sim" : "Não",
        updatedFormData.historicoDoencasFamiliares === "sim"
          ? `Quais: ${updatedFormData.quaisDoencasFamiliares || "Não informado"}`
          : undefined,
      )

      addQuestion("22. Já realizou tratamento para câncer?", updatedFormData.tratamentoCancer === "sim" ? "Sim" : "Não")

      addQuestion(
        "23. Você é fumante?",
        updatedFormData.fumante === "sim" ? "Sim" : "Não",
        updatedFormData.fumante === "sim"
          ? `Quantidade: ${updatedFormData.quantosCigarros || "Não informado"} cigarros por dia`
          : undefined,
      )

      addQuestion(
        "24. Faz uso ou já utilizou drogas?",
        updatedFormData.drogas === "sim" ? "Sim" : "Não",
        updatedFormData.drogas === "sim" ? `Qual: ${updatedFormData.quaisDrogas || "Não informado"}` : undefined,
      )

      addQuestion(
        "25. Já foi submetido a anestesia odontológica/bucal?",
        updatedFormData.anestesiaOdontologica === "sim" ? "Sim" : "Não",
        updatedFormData.anestesiaOdontologica === "sim"
          ? `Reação: ${updatedFormData.reacaoAnestesia || "Não informado"}`
          : undefined,
      )

      addQuestion("26. Já sofreu trauma na face?", updatedFormData.traumaFace === "sim" ? "Sim" : "Não")

      addQuestion(
        "27. Possui outras doenças não mencionadas?",
        updatedFormData.outrasDoencas === "sim" ? "Sim" : "Não",
        updatedFormData.outrasDoencas === "sim"
          ? `Quais: ${updatedFormData.quaisOutrasDoencas || "Não informado"}`
          : undefined,
      )

      // Informações adicionais
      // Verificar se precisa adicionar nova página para as informações adicionais
      if (yPos > 240) {
        pdf.addPage()
        yPos = 20
      }

      pdf.setFontSize(14)
      pdf.setTextColor(29, 185, 179)
      pdf.text("Informações Adicionais", 20, yPos)
      yPos += 10

      pdf.setFontSize(12)
      pdf.setTextColor(0, 0, 0)
      pdf.text(`Motivo da consulta: ${updatedFormData.motivoConsulta || "Não informado"}`, 20, yPos)
      yPos += 7
      pdf.text(`Como nos conheceu: ${updatedFormData.comoConheceu || "Não informado"}`, 20, yPos)
      yPos += 15

      // Declaração e assinatura
      // Verificar se precisa adicionar nova página para a declaração e assinatura
      if (yPos > 200) {
        pdf.addPage()
        yPos = 20
      }

      // Declaração
      pdf.setFontSize(11)
      pdf.text(
        "Declaro que li atentamente o questionário da anamnese e que o respondi de acordo com a verdade.",
        20,
        yPos,
      )
      yPos += 7
      pdf.text("Estou ciente de que o ocultamento de qualquer condição sobre minha saúde ou sobre o uso de", 20, yPos)
      yPos += 7
      pdf.text(
        "algum medicamento/tratamento que eu esteja realizando, interfere no diagnóstico e tratamento odontológico.",
        20,
        yPos,
      )
      yPos += 15

      // Assinatura
      pdf.setFontSize(12)
      pdf.text("Assinatura do Paciente:", 20, yPos)
      yPos += 5

      // Adicionar a imagem da assinatura
      try {
        if (assinaturaBase64 && assinaturaBase64.startsWith("data:image")) {
          pdf.addImage(assinaturaBase64, "PNG", 20, yPos, 80, 30)
        } else {
          // Fallback: adicionar texto em vez da imagem
          pdf.text("Assinatura digital registrada", 20, yPos + 15)
        }
      } catch (e) {
        console.error("Erro ao adicionar assinatura:", e)
        // Fallback: adicionar texto em vez da imagem
        pdf.text("Assinatura digital registrada", 20, yPos + 15)
      }
      yPos += 40

      pdf.text(`Data: ${new Date().toLocaleDateString("pt-BR")}`, 20, yPos)

      // Rodapé
      pdf.setFontSize(10)
      pdf.text("Vitall Check-up", 105, 280, { align: "center" })
      pdf.text(`Documento gerado em: ${new Date().toLocaleString("pt-BR")}`, 105, 285, { align: "center" })

      // Baixar o PDF
      pdf.save(
        `Anamnese_${updatedFormData.nome.replace(/\s+/g, "_")}_${new Date().toLocaleDateString("pt-BR").replace(/\//g, "-")}.pdf`,
      )

      // Mostrar animação de sucesso
      setIsSubmitSuccess(true)

      // Avançar para a tela de agradecimento
      setStep(totalSteps)

      // Mostrar mensagem de sucesso
      toast({
        title: "Anamnese finalizada com sucesso!",
        description: "O PDF foi baixado automaticamente.",
        className: "border-2 border-green-500",
      })

      console.log("PDF gerado e baixado com sucesso")
    } catch (error) {
      console.error("Erro ao gerar PDF:", error)
      toast({
        title: "Erro ao gerar PDF",
        description: error instanceof Error ? error.message : "Ocorreu um erro desconhecido",
        variant: "destructive",
      })
    } finally {
      setIsGeneratingPDF(false)
    }
  }

  // Nova função para salvar no Supabase
  const saveAnamnese = async () => {
    if (signatureRef.current && signatureRef.current.isEmpty()) {
      toast({
        title: "Assinatura necessária",
        description: "Por favor, assine o formulário antes de finalizar.",
        variant: "destructive",
      })
      return
    }

    setIsGeneratingPDF(true)

    try {
      // Capturar a assinatura como base64
      let assinaturaBase64 = ""
      if (signatureRef.current && !signatureRef.current.isEmpty()) {
        const canvas = signatureRef.current.getCanvas()
        assinaturaBase64 = canvas.toDataURL("image/png")
      }

      // Preparar dados de saúde (remover campos vazios e "Não")
      const dadosSaude: Record<string, any> = {}
      Object.entries(formData).forEach(([key, value]) => {
        // Excluir dados pessoais e assinatura
        if (!['nome', 'endereco', 'telefone', 'telefoneAuxiliar', 'email', 'instagram', 'assinatura'].includes(key)) {
          if (value && value !== 'não' && value !== 'Não') {
            dadosSaude[key] = value
          }
        }
      })

      // Salvar no Supabase
      const { data, error } = await supabase
        .from('anamneses')
        .insert({
          patient_id: patientId,
          nome: formData.nome,
          endereco: formData.endereco || null,
          telefone: formData.telefone || null,
          telefone_auxiliar: formData.telefoneAuxiliar || null,
          email: formData.email || null,
          instagram: formData.instagram || null,
          dados_saude: dadosSaude,
          assinatura: assinaturaBase64 || null
        })
        .select()
        .single()

      if (error) throw error

      // Mostrar sucesso
      setIsSubmitSuccess(true)
      setStep(totalSteps)

      toast({
        title: "Anamnese salva com sucesso!",
        description: "Os dados foram salvos no banco de dados.",
        className: "border-2 border-green-500",
      })

      // Redirecionar após 2 segundos
      setTimeout(() => {
        router.push(`/patients/${patientId}`)
      }, 2000)

    } catch (error) {
      console.error("Erro ao salvar anamnese:", error)
      toast({
        title: "Erro ao salvar anamnese",
        description: error instanceof Error ? error.message : "Ocorreu um erro desconhecido",
        variant: "destructive",
      })
    } finally {
      setIsGeneratingPDF(false)
    }
  }

  // Calcular a porcentagem de progresso
  const progressPercentage = ((step + 1) / (totalSteps + 1)) * 100

  // Renderizar o conteúdo da etapa atual
  const renderStepContent = () => {
    switch (step) {
      case 0: // Texto introdutório da anamnese
        return (
          <div className="text-left">
            <h2 className="text-2xl font-semibold mb-3 text-center">
              <span className="text-secondary">
                {greeting}, {formData.nome.split(' ')[0].charAt(0).toUpperCase() + formData.nome.split(' ')[0].slice(1).toLowerCase()}!
              </span>
            </h2>
            <h3 className="text-xl font-semibold mb-4 text-center text-primary">ANAMNESE CLÍNICA</h3>

            <div className="bg-gray-50 p-4 rounded-lg mb-6">
              <p className="text-gray-700">
                A anamnese é de extrema importância para o conhecimento do estado de saúde geral e bucal do paciente e
                interfere no tratamento a ser realizado. Informações omitidas ou incorretas podem alterar os resultados
                esperados em relação à terapia odontológica realizada.
              </p>
            </div>

            <p className="text-gray-700 mb-4">
              Por favor, responda às perguntas a seguir com atenção. Suas respostas são confidenciais e serão utilizadas
              apenas para fins de tratamento odontológico.
            </p>

            <p className="text-gray-700">
              Nas próximas telas, você responderá a perguntas sobre seu histórico médico e condições de saúde. Ao final,
              você assinará digitalmente o documento.
            </p>

            <div className="mt-6 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
              <div className="flex items-start">
                <AlertCircle className="text-yellow-500 mr-2 mt-0.5" size={18} />
                <p className="text-sm text-yellow-700">
                  <strong>Importante:</strong> Todas as perguntas são obrigatórias. Respostas precisas são essenciais
                  para seu tratamento odontológico adequado.
                </p>
              </div>
            </div>
          </div>
        )

      case 1: // Perguntas 1-14
        return (
          <div className="text-left">
            <h2 className="text-xl font-semibold mb-4 text-center text-primary">ANAMNESE CLÍNICA</h2>

            {errors.length > 0 && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg">
                <p className="text-red-600 font-medium mb-1">Por favor, responda todas as perguntas:</p>
                <ul className="list-disc pl-5 text-sm text-red-600">
                  {errors.slice(0, 3).map((error, index) => (
                    <li key={index}>{error}</li>
                  ))}
                  {errors.length > 3 && <li>...e outras {errors.length - 3} perguntas</li>}
                </ul>
              </div>
            )}

            <div className="space-y-6">
              {/* Pergunta 1 */}
              <div
                className={`border-b pb-4 ${!formData.tratamentoMedico && errors.includes("Pergunta 1 não respondida") ? "error-highlight" : ""}`}
              >
                <p className="font-medium mb-2 flex items-center">
                  1. Está em tratamento médico? <span className="text-red-500 ml-1">*</span>
                </p>
                <RadioGroup
                  value={formData.tratamentoMedico}
                  onValueChange={(value) => handleRadioChange("tratamentoMedico", value)}
                  className="flex space-x-6 mb-2"
                >
                  <div className="flex items-center space-x-3">
                    <RadioGroupItem value="sim" id="tratamento-sim" className="custom-radio-square h-5 w-5" />
                    <Label htmlFor="tratamento-sim" className="text-lg">
                      Sim
                    </Label>
                  </div>
                  <div className="flex items-center space-x-3">
                    <RadioGroupItem value="nao" id="tratamento-nao" className="custom-radio-square h-5 w-5" />
                    <Label htmlFor="tratamento-nao" className="text-lg">
                      Não
                    </Label>
                  </div>
                </RadioGroup>
                {!formData.tratamentoMedico && errors.includes("Pergunta 1 não respondida") && (
                  <p className="text-red-500 text-sm mt-1">Esta pergunta é obrigatória</p>
                )}

                {formData.tratamentoMedico === "sim" && (
                  <div className="space-y-2 mt-2 pl-4">
                    <div>
                      <Label htmlFor="motivoTratamento" className="text-sm flex items-center">
                        Qual o motivo? <span className="text-red-500 ml-1">*</span>
                      </Label>
                      <Input
                        id="motivoTratamento"
                        value={formData.motivoTratamento}
                        onChange={(e) => handleInputChange("motivoTratamento", e.target.value)}
                        className={`border-2 anamnese-input ${formData.tratamentoMedico === "sim" && !formData.motivoTratamento && errors.includes("Motivo do tratamento é obrigatório") ? "border-red-500" : ""}`}
                      />
                      {formData.tratamentoMedico === "sim" &&
                        !formData.motivoTratamento &&
                        errors.includes("Motivo do tratamento é obrigatório") && (
                          <p className="text-red-500 text-sm mt-1">Este campo é obrigatório</p>
                        )}
                    </div>
                    <div>
                      <Label htmlFor="nomeMedico" className="text-sm flex items-center">
                        Nome do médico: <span className="text-red-500 ml-1">*</span>
                      </Label>
                      <Input
                        id="nomeMedico"
                        value={formData.nomeMedico}
                        onChange={(e) => handleInputChange("nomeMedico", e.target.value)}
                        className={`border-2 anamnese-input ${formData.tratamentoMedico === "sim" && !formData.nomeMedico && errors.includes("Nome do médico é obrigatório") ? "border-red-500" : ""}`}
                      />
                      {formData.tratamentoMedico === "sim" &&
                        !formData.nomeMedico &&
                        errors.includes("Nome do médico é obrigatório") && (
                          <p className="text-red-500 text-sm mt-1">Este campo é obrigatório</p>
                        )}
                    </div>
                  </div>
                )}
              </div>

              {/* Pergunta 2 */}
              <div
                className={`border-b pb-4 ${!formData.medicamentoContinuo && errors.includes("Pergunta 2 não respondida") ? "error-highlight" : ""}`}
              >
                <p className="font-medium mb-2 flex items-center">
                  2. Faz uso de algum medicamento de forma contínua? <span className="text-red-500 ml-1">*</span>
                </p>
                <RadioGroup
                  value={formData.medicamentoContinuo}
                  onValueChange={(value) => handleRadioChange("medicamentoContinuo", value)}
                  className="flex space-x-6 mb-2"
                >
                  <div className="flex items-center space-x-3">
                    <RadioGroupItem value="sim" id="medicamento-sim" className="custom-radio-square h-5 w-5" />
                    <Label htmlFor="medicamento-sim" className="text-lg">
                      Sim
                    </Label>
                  </div>
                  <div className="flex items-center space-x-3">
                    <RadioGroupItem value="nao" id="medicamento-nao" className="custom-radio-square h-5 w-5" />
                    <Label htmlFor="medicamento-nao" className="text-lg">
                      Não
                    </Label>
                  </div>
                </RadioGroup>
                {!formData.medicamentoContinuo && errors.includes("Pergunta 2 não respondida") && (
                  <p className="text-red-500 text-sm mt-1">Esta pergunta é obrigatória</p>
                )}

                {formData.medicamentoContinuo === "sim" && (
                  <div className="mt-2 pl-4">
                    <Label htmlFor="quaisMedicamentos" className="text-sm flex items-center">
                      Quais medicamentos? <span className="text-red-500 ml-1">*</span>
                    </Label>
                    <Input
                      id="quaisMedicamentos"
                      value={formData.quaisMedicamentos}
                      onChange={(e) => handleInputChange("quaisMedicamentos", e.target.value)}
                      className={`border-2 anamnese-input ${formData.medicamentoContinuo === "sim" && !formData.quaisMedicamentos && errors.includes("Informe quais medicamentos") ? "border-red-500" : ""}`}
                    />
                    {formData.medicamentoContinuo === "sim" &&
                      !formData.quaisMedicamentos &&
                      errors.includes("Informe quais medicamentos") && (
                        <p className="text-red-500 text-sm mt-1">Este campo é obrigatório</p>
                      )}
                  </div>
                )}
              </div>

              {/* Pergunta sobre medicamentos naturais */}
              <div
                className={`border-b pb-4 ${!formData.medicamentosNaturais && errors.includes("Pergunta sobre medicamentos naturais não respondida") ? "error-highlight" : ""}`}
              >
                <p className="font-medium mb-2 flex items-center">
                  3. Faz uso de medicamentos naturais? <span className="text-red-500 ml-1">*</span>
                </p>
                <RadioGroup
                  value={formData.medicamentosNaturais}
                  onValueChange={(value) => handleRadioChange("medicamentosNaturais", value)}
                  className="flex space-x-6 mb-2"
                >
                  <div className="flex items-center space-x-3">
                    <RadioGroupItem
                      value="sim"
                      id="medicamentos-naturais-sim"
                      className="custom-radio-square h-5 w-5"
                    />
                    <Label htmlFor="medicamentos-naturais-sim" className="text-lg">
                      Sim
                    </Label>
                  </div>
                  <div className="flex items-center space-x-3">
                    <RadioGroupItem
                      value="nao"
                      id="medicamentos-naturais-nao"
                      className="custom-radio-square h-5 w-5"
                    />
                    <Label htmlFor="medicamentos-naturais-nao" className="text-lg">
                      Não
                    </Label>
                  </div>
                </RadioGroup>
                {!formData.medicamentosNaturais &&
                  errors.includes("Pergunta sobre medicamentos naturais não respondida") && (
                    <p className="text-red-500 text-sm mt-1">Esta pergunta é obrigatória</p>
                  )}

                {formData.medicamentosNaturais === "sim" && (
                  <div className="mt-2 pl-4">
                    <Label htmlFor="quaisMedicamentosNaturais" className="text-sm flex items-center">
                      Quais? <span className="text-red-500 ml-1">*</span>
                    </Label>
                    <Input
                      id="quaisMedicamentosNaturais"
                      value={formData.quaisMedicamentosNaturais}
                      onChange={(e) => handleInputChange("quaisMedicamentosNaturais", e.target.value)}
                      className={`border-2 anamnese-input ${formData.medicamentosNaturais === "sim" && !formData.quaisMedicamentosNaturais && errors.includes("Informe quais medicamentos naturais") ? "border-red-500" : ""}`}
                    />
                    {formData.medicamentosNaturais === "sim" &&
                      !formData.quaisMedicamentosNaturais &&
                      errors.includes("Informe quais medicamentos naturais") && (
                        <p className="text-red-500 text-sm mt-1">Este campo é obrigatório</p>
                      )}
                  </div>
                )}
              </div>

              {/* Restante das perguntas 3-14 com validação similar */}
              {/* Pergunta 4 */}
              <div
                className={`border-b pb-4 ${!formData.hospitalizado && errors.includes("Pergunta 4 não respondida") ? "error-highlight" : ""}`}
              >
                <p className="font-medium mb-2 flex items-center">
                  4. Já foi hospitalizado(a)? <span className="text-red-500 ml-1">*</span>
                </p>
                <RadioGroup
                  value={formData.hospitalizado}
                  onValueChange={(value) => handleRadioChange("hospitalizado", value)}
                  className="flex space-x-6 mb-2"
                >
                  <div className="flex items-center space-x-3">
                    <RadioGroupItem value="sim" id="hospitalizado-sim" className="custom-radio-square h-5 w-5" />
                    <Label htmlFor="hospitalizado-sim" className="text-lg">
                      Sim
                    </Label>
                  </div>
                  <div className="flex items-center space-x-3">
                    <RadioGroupItem value="nao" id="hospitalizado-nao" className="custom-radio-square h-5 w-5" />
                    <Label htmlFor="hospitalizado-nao" className="text-lg">
                      Não
                    </Label>
                  </div>
                </RadioGroup>
                {!formData.hospitalizado && errors.includes("Pergunta 4 não respondida") && (
                  <p className="text-red-500 text-sm mt-1">Esta pergunta é obrigatória</p>
                )}

                {formData.hospitalizado === "sim" && (
                  <div className="mt-2 pl-4">
                    <Label htmlFor="motivoHospitalizacao" className="text-sm flex items-center">
                      Qual o motivo? <span className="text-red-500 ml-1">*</span>
                    </Label>
                    <Input
                      id="motivoHospitalizacao"
                      value={formData.motivoHospitalizacao}
                      onChange={(e) => handleInputChange("motivoHospitalizacao", e.target.value)}
                      className={`border-2 anamnese-input ${formData.hospitalizado === "sim" && !formData.motivoHospitalizacao && errors.includes("Motivo da hospitalização é obrigatório") ? "border-red-500" : ""}`}
                    />
                    {formData.hospitalizado === "sim" &&
                      !formData.motivoHospitalizacao &&
                      errors.includes("Motivo da hospitalização é obrigatório") && (
                        <p className="text-red-500 text-sm mt-1">Este campo é obrigatório</p>
                      )}
                  </div>
                )}
              </div>

              {/* Continuar com as perguntas 4-14 seguindo o mesmo padrão */}
              {/* ... */}
              {/* Pergunta 5 */}
              <div
                className={`border-b pb-4 ${!formData.gravida && errors.includes("Pergunta 5 não respondida") ? "error-highlight" : ""}`}
              >
                <p className="font-medium mb-2 flex items-center">
                  5. Está grávida? <span className="text-red-500 ml-1">*</span>
                </p>
                <RadioGroup
                  value={formData.gravida}
                  onValueChange={(value) => handleRadioChange("gravida", value)}
                  className="flex space-x-6 mb-2"
                >
                  <div className="flex items-center space-x-3">
                    <RadioGroupItem value="sim" id="gravida-sim" className="custom-radio-square h-5 w-5" />
                    <Label htmlFor="gravida-sim" className="text-lg">
                      Sim
                    </Label>
                  </div>
                  <div className="flex items-center space-x-3">
                    <RadioGroupItem value="nao" id="gravida-nao" className="custom-radio-square h-5 w-5" />
                    <Label htmlFor="gravida-nao" className="text-lg">
                      Não
                    </Label>
                  </div>
                </RadioGroup>
                {!formData.gravida && errors.includes("Pergunta 5 não respondida") && (
                  <p className="text-red-500 text-sm mt-1">Esta pergunta é obrigatória</p>
                )}

                {formData.gravida === "sim" && (
                  <div className="mt-2 pl-4">
                    <Label htmlFor="periodoGestacional" className="text-sm flex items-center">
                      Período gestacional <span className="text-red-500 ml-1">*</span>
                    </Label>
                    <Input
                      id="periodoGestacional"
                      value={formData.periodoGestacional}
                      onChange={(e) => handleInputChange("periodoGestacional", e.target.value)}
                      className={`border-2 anamnese-input ${formData.gravida === "sim" && !formData.periodoGestacional && errors.includes("Período gestacional é obrigatório") ? "border-red-500" : ""}`}
                    />
                    {formData.gravida === "sim" &&
                      !formData.periodoGestacional &&
                      errors.includes("Período gestacional é obrigatório") && (
                        <p className="text-red-500 text-sm mt-1">Este campo é obrigatório</p>
                      )}
                  </div>
                )}
              </div>

              {/* Pergunta 6 */}
              <div
                className={`border-b pb-4 ${!formData.dieta && errors.includes("Pergunta 6 não respondida") ? "error-highlight" : ""}`}
              >
                <p className="font-medium mb-2 flex items-center">
                  6. Está fazendo dieta? <span className="text-red-500 ml-1">*</span>
                </p>
                <RadioGroup
                  value={formData.dieta}
                  onValueChange={(value) => handleRadioChange("dieta", value)}
                  className="flex space-x-6 mb-2"
                >
                  <div className="flex items-center space-x-3">
                    <RadioGroupItem value="sim" id="dieta-sim" className="custom-radio-square h-5 w-5" />
                    <Label htmlFor="dieta-sim" className="text-lg">
                      Sim
                    </Label>
                  </div>
                  <div className="flex items-center space-x-3">
                    <RadioGroupItem value="nao" id="dieta-nao" className="custom-radio-square h-5 w-5" />
                    <Label htmlFor="dieta-nao" className="text-lg">
                      Não
                    </Label>
                  </div>
                </RadioGroup>
                {!formData.dieta && errors.includes("Pergunta 6 não respondida") && (
                  <p className="text-red-500 text-sm mt-1">Esta pergunta é obrigatória</p>
                )}

                {formData.dieta === "sim" && (
                  <div className="space-y-2 mt-2 pl-4">
                    <div>
                      <Label htmlFor="qualDieta" className="text-sm flex items-center">
                        Qual dieta? <span className="text-red-500 ml-1">*</span>
                      </Label>
                      <Input
                        id="qualDieta"
                        value={formData.qualDieta}
                        onChange={(e) => handleInputChange("qualDieta", e.target.value)}
                        className={`border-2 anamnese-input ${formData.dieta === "sim" && !formData.qualDieta && errors.includes("Informe qual dieta") ? "border-red-500" : ""}`}
                      />
                      {formData.dieta === "sim" && !formData.qualDieta && errors.includes("Informe qual dieta") && (
                        <p className="text-red-500 text-sm mt-1">Este campo é obrigatório</p>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* Pergunta 7 */}
              <div
                className={`border-b pb-4 ${!formData.alergia && errors.includes("Pergunta 7 não respondida") ? "error-highlight" : ""}`}
              >
                <p className="font-medium mb-2 flex items-center">
                  7. Possui alguma alergia? <span className="text-red-500 ml-1">*</span>
                </p>
                <RadioGroup
                  value={formData.alergia}
                  onValueChange={(value) => handleRadioChange("alergia", value)}
                  className="flex space-x-6 mb-2"
                >
                  <div className="flex items-center space-x-3">
                    <RadioGroupItem value="sim" id="alergia-sim" className="custom-radio-square h-5 w-5" />
                    <Label htmlFor="alergia-sim" className="text-lg">
                      Sim
                    </Label>
                  </div>
                  <div className="flex items-center space-x-3">
                    <RadioGroupItem value="nao" id="alergia-nao" className="custom-radio-square h-5 w-5" />
                    <Label htmlFor="alergia-nao" className="text-lg">
                      Não
                    </Label>
                  </div>
                </RadioGroup>
                {!formData.alergia && errors.includes("Pergunta 7 não respondida") && (
                  <p className="text-red-500 text-sm mt-1">Esta pergunta é obrigatória</p>
                )}

                {formData.alergia === "sim" && (
                  <div className="mt-2 pl-4">
                    <Label htmlFor="qualAlergia" className="text-sm flex items-center">
                      Qual alergia? <span className="text-red-500 ml-1">*</span>
                    </Label>
                    <Input
                      id="qualAlergia"
                      value={formData.qualAlergia}
                      onChange={(e) => handleInputChange("qualAlergia", e.target.value)}
                      className={`border-2 anamnese-input ${formData.alergia === "sim" && !formData.qualAlergia && errors.includes("Informe qual alergia") ? "border-red-500" : ""}`}
                    />
                    {formData.alergia === "sim" && !formData.qualAlergia && errors.includes("Informe qual alergia") && (
                      <p className="text-red-500 text-sm mt-1">Este campo é obrigatório</p>
                    )}
                  </div>
                )}
              </div>

              {/* Pergunta 8 */}
              <div
                className={`border-b pb-4 ${!formData.alteracaoCoagulacao && errors.includes("Pergunta 8 não respondida") ? "error-highlight" : ""}`}
              >
                <p className="font-medium mb-2 flex items-center">
                  8. Possui alterações na coagulação do sangue? <span className="text-red-500 ml-1">*</span>
                </p>
                <RadioGroup
                  value={formData.alteracaoCoagulacao}
                  onValueChange={(value) => handleRadioChange("alteracaoCoagulacao", value)}
                  className="flex space-x-6 mb-2"
                >
                  <div className="flex items-center space-x-3">
                    <RadioGroupItem value="sim" id="coagulacao-sim" className="custom-radio-square h-5 w-5" />
                    <Label htmlFor="coagulacao-sim" className="text-lg">
                      Sim
                    </Label>
                  </div>
                  <div className="flex items-center space-x-3">
                    <RadioGroupItem value="nao" id="coagulacao-nao" className="custom-radio-square h-5 w-5" />
                    <Label htmlFor="coagulacao-nao" className="text-lg">
                      Não
                    </Label>
                  </div>
                </RadioGroup>
                {!formData.alteracaoCoagulacao && errors.includes("Pergunta 8 não respondida") && (
                  <p className="text-red-500 text-sm mt-1">Esta pergunta é obrigatória</p>
                )}

                {formData.alteracaoCoagulacao === "sim" && (
                  <div className="mt-2 pl-4">
                    <Label htmlFor="qualAlteracaoCoagulacao" className="text-sm flex items-center">
                      Qual alteração? <span className="text-red-500 ml-1">*</span>
                    </Label>
                    <Input
                      id="qualAlteracaoCoagulacao"
                      value={formData.qualAlteracaoCoagulacao}
                      onChange={(e) => handleInputChange("qualAlteracaoCoagulacao", e.target.value)}
                      className={`border-2 anamnese-input ${formData.alteracaoCoagulacao === "sim" && !formData.qualAlteracaoCoagulacao && errors.includes("Informe qual alteração na coagulação") ? "border-red-500" : ""}`}
                    />
                    {formData.alteracaoCoagulacao === "sim" &&
                      !formData.qualAlteracaoCoagulacao &&
                      errors.includes("Informe qual alteração na coagulação") && (
                        <p className="text-red-500 text-sm mt-1">Este campo é obrigatório</p>
                      )}
                  </div>
                )}
              </div>

              {/* Pergunta 9 */}
              <div
                className={`border-b pb-4 ${!formData.febreReumatica && errors.includes("Pergunta 9 não respondida") ? "error-highlight" : ""}`}
              >
                <p className="font-medium mb-2 flex items-center">
                  9. Já teve febre reumática? (Doença inflamatória que ocorre após um episódio de amigdalite bacteriana){" "}
                  <span className="text-red-500 ml-1">*</span>
                </p>
                <RadioGroup
                  value={formData.febreReumatica}
                  onValueChange={(value) => handleRadioChange("febreReumatica", value)}
                  className="flex space-x-6 mb-2"
                >
                  <div className="flex items-center space-x-3">
                    <RadioGroupItem value="sim" id="febre-sim" className="custom-radio-square h-5 w-5" />
                    <Label htmlFor="febre-sim" className="text-lg">
                      Sim
                    </Label>
                  </div>
                  <div className="flex items-center space-x-3">
                    <RadioGroupItem value="nao" id="febre-nao" className="custom-radio-square h-5 w-5" />
                    <Label htmlFor="febre-nao" className="text-lg">
                      Não
                    </Label>
                  </div>
                </RadioGroup>
                {!formData.febreReumatica && errors.includes("Pergunta 9 não respondida") && (
                  <p className="text-red-500 text-sm mt-1">Esta pergunta é obrigatória</p>
                )}
              </div>

              {/* Pergunta 10 */}
              <div
                className={`border-b pb-4 ${!formData.doencaAutoimune && errors.includes("Pergunta 10 não respondida") ? "error-highlight" : ""}`}
              >
                <p className="font-medium mb-2 flex items-center">
                  10. Possui doença autoimune? (condição em que o sistema imunológico ataca o próprio corpo){" "}
                  <span className="text-red-500 ml-1">*</span>
                </p>
                <RadioGroup
                  value={formData.doencaAutoimune}
                  onValueChange={(value) => handleRadioChange("doencaAutoimune", value)}
                  className="flex space-x-6 mb-2"
                >
                  <div className="flex items-center space-x-3">
                    <RadioGroupItem value="sim" id="autoimune-sim" className="custom-radio-square h-5 w-5" />
                    <Label htmlFor="autoimune-sim" className="text-lg">
                      Sim
                    </Label>
                  </div>
                  <div className="flex items-center space-x-3">
                    <RadioGroupItem value="nao" id="autoimune-nao" className="custom-radio-square h-5 w-5" />
                    <Label htmlFor="autoimune-nao" className="text-lg">
                      Não
                    </Label>
                  </div>
                </RadioGroup>
                {!formData.doencaAutoimune && errors.includes("Pergunta 10 não respondida") && (
                  <p className="text-red-500 text-sm mt-1">Esta pergunta é obrigatória</p>
                )}

                {formData.doencaAutoimune === "sim" && (
                  <div className="mt-2 pl-4">
                    <Label htmlFor="qualDoencaAutoimune" className="text-sm flex items-center">
                      Qual doença? <span className="text-red-500 ml-1">*</span>
                    </Label>
                    <Input
                      id="qualDoencaAutoimune"
                      value={formData.qualDoencaAutoimune}
                      onChange={(e) => handleInputChange("qualDoencaAutoimune", e.target.value)}
                      className={`border-2 anamnese-input ${formData.doencaAutoimune === "sim" && !formData.qualDoencaAutoimune && errors.includes("Informe qual doença autoimune") ? "border-red-500" : ""}`}
                    />
                    {formData.doencaAutoimune === "sim" &&
                      !formData.qualDoencaAutoimune &&
                      errors.includes("Informe qual doença autoimune") && (
                        <p className="text-red-500 text-sm mt-1">Este campo é obrigatório</p>
                      )}
                  </div>
                )}
              </div>

              {/* Pergunta 11 */}
              <div
                className={`border-b pb-4 ${!formData.doencaRenalHepatica && errors.includes("Pergunta 11 não respondida") ? "error-highlight" : ""}`}
              >
                <p className="font-medium mb-2 flex items-center">
                  11. Possui doença renal ou hepática? <span className="text-red-500 ml-1">*</span>
                </p>
                <RadioGroup
                  value={formData.doencaRenalHepatica}
                  onValueChange={(value) => handleRadioChange("doencaRenalHepatica", value)}
                  className="flex space-x-6 mb-2"
                >
                  <div className="flex items-center space-x-3">
                    <RadioGroupItem value="sim" id="renal-sim" className="custom-radio-square h-5 w-5" />
                    <Label htmlFor="renal-sim" className="text-lg">
                      Sim
                    </Label>
                  </div>
                  <div className="flex items-center space-x-3">
                    <RadioGroupItem value="nao" id="renal-nao" className="custom-radio-square h-5 w-5" />
                    <Label htmlFor="renal-nao" className="text-lg">
                      Não
                    </Label>
                  </div>
                </RadioGroup>
                {!formData.doencaRenalHepatica && errors.includes("Pergunta 11 não respondida") && (
                  <p className="text-red-500 text-sm mt-1">Esta pergunta é obrigatória</p>
                )}

                {formData.doencaRenalHepatica === "sim" && (
                  <div className="mt-2 pl-4">
                    <Label htmlFor="qualDoencaRenalHepatica" className="text-sm flex items-center">
                      Qual doença? <span className="text-red-500 ml-1">*</span>
                    </Label>
                    <Input
                      id="qualDoencaRenalHepatica"
                      value={formData.qualDoencaRenalHepatica}
                      onChange={(e) => handleInputChange("qualDoencaRenalHepatica", e.target.value)}
                      className={`border-2 anamnese-input ${formData.doencaRenalHepatica === "sim" && !formData.qualDoencaRenalHepatica && errors.includes("Informe qual doença renal/hepática") ? "border-red-500" : ""}`}
                    />
                    {formData.doencaRenalHepatica === "sim" &&
                      !formData.qualDoencaRenalHepatica &&
                      errors.includes("Informe qual doença renal/hepática") && (
                        <p className="text-red-500 text-sm mt-1">Este campo é obrigatório</p>
                      )}
                  </div>
                )}
              </div>

              {/* Pergunta 12 */}
              <div
                className={`border-b pb-4 ${!formData.diabetes && errors.includes("Pergunta 12 não respondida") ? "error-highlight" : ""}`}
              >
                <p className="font-medium mb-2 flex items-center">
                  12. Possui diabetes? <span className="text-red-500 ml-1">*</span>
                </p>
                <RadioGroup
                  value={formData.diabetes}
                  onValueChange={(value) => handleRadioChange("diabetes", value)}
                  className="flex space-x-6 mb-2"
                >
                  <div className="flex items-center space-x-3">
                    <RadioGroupItem value="sim" id="diabetes-sim" className="custom-radio-square h-5 w-5" />
                    <Label htmlFor="diabetes-sim" className="text-lg">
                      Sim
                    </Label>
                  </div>
                  <div className="flex items-center space-x-3">
                    <RadioGroupItem value="nao" id="diabetes-nao" className="custom-radio-square h-5 w-5" />
                    <Label htmlFor="diabetes-nao" className="text-lg">
                      Não
                    </Label>
                  </div>
                </RadioGroup>
                {!formData.diabetes && errors.includes("Pergunta 12 não respondida") && (
                  <p className="text-red-500 text-sm mt-1">Esta pergunta é obrigatória</p>
                )}

                {formData.diabetes === "sim" && (
                  <div className="mt-2 pl-4">
                    <Label htmlFor="tipoDiabetes" className="text-sm flex items-center">
                      Tipo de diabetes <span className="text-red-500 ml-1">*</span>
                    </Label>
                    <Input
                      id="tipoDiabetes"
                      value={formData.tipoDiabetes}
                      onChange={(e) => handleInputChange("tipoDiabetes", e.target.value)}
                      className={`border-2 anamnese-input ${formData.diabetes === "sim" && !formData.tipoDiabetes && errors.includes("Informe o tipo de diabetes") ? "border-red-500" : ""}`}
                    />
                    {formData.diabetes === "sim" &&
                      !formData.tipoDiabetes &&
                      errors.includes("Informe o tipo de diabetes") && (
                        <p className="text-red-500 text-sm mt-1">Este campo é obrigatório</p>
                      )}
                  </div>
                )}
              </div>

              {/* Pergunta 13 */}
              <div
                className={`border-b pb-4 ${!formData.doencaCardiovascular && errors.includes("Pergunta 13 não respondida") ? "error-highlight" : ""}`}
              >
                <p className="font-medium mb-2 flex items-center">
                  13. Possui doença cardiovascular? <span className="text-red-500 ml-1">*</span>
                </p>
                <RadioGroup
                  value={formData.doencaCardiovascular}
                  onValueChange={(value) => handleRadioChange("doencaCardiovascular", value)}
                  className="flex space-x-6 mb-2"
                >
                  <div className="flex items-center space-x-3">
                    <RadioGroupItem value="sim" id="cardiovascular-sim" className="custom-radio-square h-5 w-5" />
                    <Label htmlFor="cardiovascular-sim" className="text-lg">
                      Sim
                    </Label>
                  </div>
                  <div className="flex items-center space-x-3">
                    <RadioGroupItem value="nao" id="cardiovascular-nao" className="custom-radio-square h-5 w-5" />
                    <Label htmlFor="cardiovascular-nao" className="text-lg">
                      Não
                    </Label>
                  </div>
                </RadioGroup>
                {!formData.doencaCardiovascular && errors.includes("Pergunta 13 não respondida") && (
                  <p className="text-red-500 text-sm mt-1">Esta pergunta é obrigatória</p>
                )}

                {formData.doencaCardiovascular === "sim" && (
                  <div className="mt-2 pl-4">
                    <Label htmlFor="qualDoencaCardiovascular" className="text-sm flex items-center">
                      Qual doença? <span className="text-red-500 ml-1">*</span>
                    </Label>
                    <Input
                      id="qualDoencaCardiovascular"
                      value={formData.qualDoencaCardiovascular}
                      onChange={(e) => handleInputChange("qualDoencaCardiovascular", e.target.value)}
                      className={`border-2 anamnese-input ${formData.doencaCardiovascular === "sim" && !formData.qualDoencaCardiovascular && errors.includes("Informe qual doença cardiovascular") ? "border-red-500" : ""}`}
                    />
                    {formData.doencaCardiovascular === "sim" &&
                      !formData.qualDoencaCardiovascular &&
                      errors.includes("Informe qual doença cardiovascular") && (
                        <p className="text-red-500 text-sm mt-1">Este campo é obrigatório</p>
                      )}
                  </div>
                )}
              </div>

              {/* Pergunta 14 */}
              <div
                className={`border-b pb-4 ${!formData.hepatite && errors.includes("Pergunta 14 não respondida") ? "error-highlight" : ""}`}
              >
                <p className="font-medium mb-2 flex items-center">
                  14. Tem/Teve hepatite? <span className="text-red-500 ml-1">*</span>
                </p>
                <RadioGroup
                  value={formData.hepatite}
                  onValueChange={(value) => handleRadioChange("hepatite", value)}
                  className="flex space-x-6 mb-2"
                >
                  <div className="flex items-center space-x-3">
                    <RadioGroupItem value="sim" id="hepatite-sim" className="custom-radio-square h-5 w-5" />
                    <Label htmlFor="hepatite-sim" className="text-lg">
                      Sim
                    </Label>
                  </div>
                  <div className="flex items-center space-x-3">
                    <RadioGroupItem value="nao" id="hepatite-nao" className="custom-radio-square h-5 w-5" />
                    <Label htmlFor="hepatite-nao" className="text-lg">
                      Não
                    </Label>
                  </div>
                </RadioGroup>
                {!formData.hepatite && errors.includes("Pergunta 14 não respondida") && (
                  <p className="text-red-500 text-sm mt-1">Esta pergunta é obrigatória</p>
                )}

                {formData.hepatite === "sim" && (
                  <div className="mt-2 pl-4">
                    <Label htmlFor="tipoHepatite" className="text-sm flex items-center">
                      Tipo de hepatite <span className="text-red-500 ml-1">*</span>
                    </Label>
                    <Input
                      id="tipoHepatite"
                      value={formData.tipoHepatite}
                      onChange={(e) => handleInputChange("tipoHepatite", e.target.value)}
                      className={`border-2 anamnese-input ${formData.hepatite === "sim" && !formData.tipoHepatite && errors.includes("Informe o tipo de hepatite") ? "border-red-500" : ""}`}
                    />
                    {formData.hepatite === "sim" &&
                      !formData.tipoHepatite &&
                      errors.includes("Informe o tipo de hepatite") && (
                        <p className="text-red-500 text-sm mt-1">Este campo é obrigatório</p>
                      )}
                  </div>
                )}
              </div>

              {/* Pergunta 15 */}
              <div
                className={`border-b pb-4 ${!formData.pressaoArterial && errors.includes("Pergunta 15 não respondida") ? "error-highlight" : ""}`}
              >
                <p className="font-medium mb-2 flex items-center">
                  15. Pressão arterial: <span className="text-red-500 ml-1">*</span>
                </p>
                <RadioGroup
                  value={formData.pressaoArterial}
                  onValueChange={(value) => handleRadioChange("pressaoArterial", value)}
                  className="flex space-x-6 mb-2"
                >
                  <div className="flex items-center space-x-3">
                    <RadioGroupItem value="normal" id="pressao-normal" className="custom-radio-square h-5 w-5" />
                    <Label htmlFor="pressao-normal" className="text-lg">
                      Normal
                    </Label>
                  </div>
                  <div className="flex items-center space-x-3">
                    <RadioGroupItem value="alta" id="pressao-alta" className="custom-radio-square h-5 w-5" />
                    <Label htmlFor="pressao-alta" className="text-lg">
                      Alta
                    </Label>
                  </div>
                  <div className="flex items-center space-x-3">
                    <RadioGroupItem value="baixa" id="pressao-baixa" className="custom-radio-square h-5 w-5" />
                    <Label htmlFor="pressao-baixa" className="text-lg">
                      Baixa
                    </Label>
                  </div>
                </RadioGroup>
                {!formData.pressaoArterial && errors.includes("Pergunta 15 não respondida") && (
                  <p className="text-red-500 text-sm mt-1">Esta pergunta é obrigatória</p>
                )}
              </div>
            </div>
          </div>
        )

      case 2: // Perguntas 15-28 (com validação similar)
        return (
          <div className="text-left">
            <h2 className="text-xl font-semibold mb-4 text-center text-primary">ANAMNESE CLÍNICA</h2>

            {errors.length > 0 && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg">
                <p className="text-red-600 font-medium mb-1">Por favor, responda todas as perguntas:</p>
                <ul className="list-disc pl-5 text-sm text-red-600">
                  {errors.slice(0, 3).map((error, index) => (
                    <li key={index}>{error}</li>
                  ))}
                  {errors.length > 3 && <li>...e outras {errors.length - 3} perguntas</li>}
                </ul>
              </div>
            )}

            <div className="space-y-6">
              {/* Perguntas 15-28 com validação similar */}
              {/* Pergunta 16 */}
              <div
                className={`border-b pb-4 ${!formData.problemasRespiratorios && errors.includes("Pergunta 16 não respondida") ? "error-highlight" : ""}`}
              >
                <p className="font-medium mb-2 flex items-center">
                  16. Problemas respiratórios? <span className="text-red-500 ml-1">*</span>
                </p>
                <RadioGroup
                  value={formData.problemasRespiratorios}
                  onValueChange={(value) => handleRadioChange("problemasRespiratorios", value)}
                  className="flex space-x-6 mb-2"
                >
                  <div className="flex items-center space-x-3">
                    <RadioGroupItem value="sim" id="respiratorios-sim" className="custom-radio-square h-5 w-5" />
                    <Label htmlFor="respiratorios-sim" className="text-lg">
                      Sim
                    </Label>
                  </div>
                  <div className="flex items-center space-x-3">
                    <RadioGroupItem value="nao" id="respiratorios-nao" className="custom-radio-square h-5 w-5" />
                    <Label htmlFor="respiratorios-nao" className="text-lg">
                      Não
                    </Label>
                  </div>
                </RadioGroup>
                {!formData.problemasRespiratorios && errors.includes("Pergunta 16 não respondida") && (
                  <p className="text-red-500 text-sm mt-1">Esta pergunta é obrigatória</p>
                )}

                {formData.problemasRespiratorios === "sim" && (
                  <div className="mt-2 pl-4">
                    <Label htmlFor="quaisProblemasRespiratorios" className="text-sm flex items-center">
                      Quais problemas? <span className="text-red-500 ml-1">*</span>
                    </Label>
                    <Input
                      id="quaisProblemasRespiratorios"
                      value={formData.quaisProblemasRespiratorios}
                      onChange={(e) => handleInputChange("quaisProblemasRespiratorios", e.target.value)}
                      className={`border-2 anamnese-input ${formData.problemasRespiratorios === "sim" && !formData.quaisProblemasRespiratorios && errors.includes("Informe quais problemas respiratórios") ? "border-red-500" : ""}`}
                    />
                    {formData.problemasRespiratorios === "sim" &&
                      !formData.quaisProblemasRespiratorios &&
                      errors.includes("Informe quais problemas respiratórios") && (
                        <p className="text-red-500 text-sm mt-1">Este campo é obrigatório</p>
                      )}
                  </div>
                )}
              </div>

              {/* Pergunta 17 */}
              <div
                className={`border-b pb-4 ${!formData.gastriteUlcera && errors.includes("Pergunta 17 não respondida") ? "error-highlight" : ""}`}
              >
                <p className="font-medium mb-2 flex items-center">
                  17. Possui gastrite ou úlcera gástrica? <span className="text-red-500 ml-1">*</span>
                </p>
                <RadioGroup
                  value={formData.gastriteUlcera}
                  onValueChange={(value) => handleRadioChange("gastriteUlcera", value)}
                  className="flex space-x-6 mb-2"
                >
                  <div className="flex items-center space-x-3">
                    <RadioGroupItem value="sim" id="gastrite-sim" className="custom-radio-square h-5 w-5" />
                    <Label htmlFor="gastrite-sim" className="text-lg">
                      Sim
                    </Label>
                  </div>
                  <div className="flex items-center space-x-3">
                    <RadioGroupItem value="nao" id="gastrite-nao" className="custom-radio-square h-5 w-5" />
                    <Label htmlFor="gastrite-nao" className="text-lg">
                      Não
                    </Label>
                  </div>
                </RadioGroup>
                {!formData.gastriteUlcera && errors.includes("Pergunta 17 não respondida") && (
                  <p className="text-red-500 text-sm mt-1">Esta pergunta é obrigatória</p>
                )}
              </div>

              {/* Pergunta 18 */}
              <div
                className={`border-b pb-4 ${!formData.alteracoesNeurologicas && errors.includes("Pergunta 18 não respondida") ? "error-highlight" : ""}`}
              >
                <p className="font-medium mb-2 flex items-center">
                  18. Possui alterações neurológicas? <span className="text-red-500 ml-1">*</span>
                </p>
                <RadioGroup
                  value={formData.alteracoesNeurologicas}
                  onValueChange={(value) => handleRadioChange("alteracoesNeurologicas", value)}
                  className="flex space-x-6 mb-2"
                >
                  <div className="flex items-center space-x-3">
                    <RadioGroupItem value="sim" id="neurologicas-sim" className="custom-radio-square h-5 w-5" />
                    <Label htmlFor="neurologicas-sim" className="text-lg">
                      Sim
                    </Label>
                  </div>
                  <div className="flex items-center space-x-3">
                    <RadioGroupItem value="nao" id="neurologicas-nao" className="custom-radio-square h-5 w-5" />
                    <Label htmlFor="neurologicas-nao" className="text-lg">
                      Não
                    </Label>
                  </div>
                </RadioGroup>
                {!formData.alteracoesNeurologicas && errors.includes("Pergunta 18 não respondida") && (
                  <p className="text-red-500 text-sm mt-1">Esta pergunta é obrigatória</p>
                )}

                {formData.alteracoesNeurologicas === "sim" && (
                  <div className="mt-2 pl-4">
                    <Label htmlFor="qualAlteracaoNeurologica" className="text-sm flex items-center">
                      Qual alteração? <span className="text-red-500 ml-1">*</span>
                    </Label>
                    <Input
                      id="qualAlteracaoNeurologica"
                      value={formData.qualAlteracaoNeurologica}
                      onChange={(e) => handleInputChange("qualAlteracaoNeurologica", e.target.value)}
                      className={`border-2 anamnese-input ${formData.alteracoesNeurologicas === "sim" && !formData.qualAlteracaoNeurologica && errors.includes("Informe qual alteração neurológica") ? "border-red-500" : ""}`}
                    />
                    {formData.alteracoesNeurologicas === "sim" &&
                      !formData.qualAlteracaoNeurologica &&
                      errors.includes("Informe qual alteração neurológica") && (
                        <p className="text-red-500 text-sm mt-1">Este campo é obrigatório</p>
                      )}
                  </div>
                )}
              </div>

              {/* Pergunta 19 */}
              <div
                className={`border-b pb-4 ${!formData.condicaoPsicologica && errors.includes("Pergunta 19 não respondida") ? "error-highlight" : ""}`}
              >
                <p className="font-medium mb-2 flex items-center">
                  19. Possui condição psicológica ou psiquiátrica? <span className="text-red-500 ml-1">*</span>
                </p>
                <RadioGroup
                  value={formData.condicaoPsicologica}
                  onValueChange={(value) => handleRadioChange("condicaoPsicologica", value)}
                  className="flex space-x-6 mb-2"
                >
                  <div className="flex items-center space-x-3">
                    <RadioGroupItem value="sim" id="psicologica-sim" className="custom-radio-square h-5 w-5" />
                    <Label htmlFor="psicologica-sim" className="text-lg">
                      Sim
                    </Label>
                  </div>
                  <div className="flex items-center space-x-3">
                    <RadioGroupItem value="nao" id="psicologica-nao" className="custom-radio-square h-5 w-5" />
                    <Label htmlFor="psicologica-nao" className="text-lg">
                      Não
                    </Label>
                  </div>
                </RadioGroup>
                {!formData.condicaoPsicologica && errors.includes("Pergunta 19 não respondida") && (
                  <p className="text-red-500 text-sm mt-1">Esta pergunta é obrigatória</p>
                )}

                {formData.condicaoPsicologica === "sim" && (
                  <div className="mt-2 pl-4">
                    <Label htmlFor="qualCondicaoPsicologica" className="text-sm flex items-center">
                      Qual condição? <span className="text-red-500 ml-1">*</span>
                    </Label>
                    <Input
                      id="qualCondicaoPsicologica"
                      value={formData.qualCondicaoPsicologica}
                      onChange={(e) => handleInputChange("qualCondicaoPsicologica", e.target.value)}
                      className={`border-2 anamnese-input ${formData.condicaoPsicologica === "sim" && !formData.qualCondicaoPsicologica && errors.includes("Informe qual condição psicológica") ? "border-red-500" : ""}`}
                    />
                    {formData.condicaoPsicologica === "sim" &&
                      !formData.qualCondicaoPsicologica &&
                      errors.includes("Informe qual condição psicológica") && (
                        <p className="text-red-500 text-sm mt-1">Este campo é obrigatório</p>
                      )}
                  </div>
                )}
              </div>

              {/* Pergunta 20 */}
              <div
                className={`border-b pb-4 ${!formData.hiv && errors.includes("Pergunta 20 não respondida") ? "error-highlight" : ""}`}
              >
                <p className="font-medium mb-2 flex items-center">
                  20. Você vive com HIV? <span className="text-red-500 ml-1">*</span>
                </p>
                <RadioGroup
                  value={formData.hiv}
                  onValueChange={(value) => handleRadioChange("hiv", value)}
                  className="flex space-x-6 mb-2"
                >
                  <div className="flex items-center space-x-3">
                    <RadioGroupItem value="sim" id="hiv-sim" className="custom-radio-square h-5 w-5" />
                    <Label htmlFor="hiv-sim" className="text-lg">
                      Sim
                    </Label>
                  </div>
                  <div className="flex items-center space-x-3">
                    <RadioGroupItem value="nao" id="hiv-nao" className="custom-radio-square h-5 w-5" />
                    <Label htmlFor="hiv-nao" className="text-lg">
                      Não
                    </Label>
                  </div>
                </RadioGroup>
                {!formData.hiv && errors.includes("Pergunta 20 não respondida") && (
                  <p className="text-red-500 text-sm mt-1">Esta pergunta é obrigatória</p>
                )}
              </div>

              {/* Pergunta 21 */}
              <div
                className={`border-b pb-4 ${!formData.historicoDoencasFamiliares && errors.includes("Pergunta 21 não respondida") ? "error-highlight" : ""}`}
              >
                <p className="font-medium mb-2 flex items-center">
                  21. Apresenta histórico de doenças familiares? <span className="text-red-500 ml-1">*</span>
                </p>
                <RadioGroup
                  value={formData.historicoDoencasFamiliares}
                  onValueChange={(value) => handleRadioChange("historicoDoencasFamiliares", value)}
                  className="flex space-x-6 mb-2"
                >
                  <div className="flex items-center space-x-3">
                    <RadioGroupItem value="sim" id="doencas-familiares-sim" className="custom-radio-square h-5 w-5" />
                    <Label htmlFor="doencas-familiares-sim" className="text-lg">
                      Sim
                    </Label>
                  </div>
                  <div className="flex items-center space-x-3">
                    <RadioGroupItem value="nao" id="doencas-familiares-nao" className="custom-radio-square h-5 w-5" />
                    <Label htmlFor="doencas-familiares-nao" className="text-lg">
                      Não
                    </Label>
                  </div>
                </RadioGroup>
                {!formData.historicoDoencasFamiliares && errors.includes("Pergunta 21 não respondida") && (
                  <p className="text-red-500 text-sm mt-1">Esta pergunta é obrigatória</p>
                )}

                {formData.historicoDoencasFamiliares === "sim" && (
                  <div className="mt-2 pl-4">
                    <Label htmlFor="quaisDoencasFamiliares" className="text-sm flex items-center">
                      Quais doenças? <span className="text-red-500 ml-1">*</span>
                    </Label>
                    <Input
                      id="quaisDoencasFamiliares"
                      value={formData.quaisDoencasFamiliares}
                      onChange={(e) => handleInputChange("quaisDoencasFamiliares", e.target.value)}
                      className={`border-2 anamnese-input ${formData.historicoDoencasFamiliares === "sim" && !formData.quaisDoencasFamiliares && errors.includes("Informe quais doenças familiares") ? "border-red-500" : ""}`}
                    />
                    {formData.historicoDoencasFamiliares === "sim" &&
                      !formData.quaisDoencasFamiliares &&
                      errors.includes("Informe quais doenças familiares") && (
                        <p className="text-red-500 text-sm mt-1">Este campo é obrigatório</p>
                      )}
                  </div>
                )}
              </div>

              {/* Pergunta 22 */}
              <div
                className={`border-b pb-4 ${!formData.tratamentoCancer && errors.includes("Pergunta 22 não respondida") ? "error-highlight" : ""}`}
              >
                <p className="font-medium mb-2 flex items-center">
                  22. Já realizou tratamento para câncer? <span className="text-red-500 ml-1">*</span>
                </p>
                <RadioGroup
                  value={formData.tratamentoCancer}
                  onValueChange={(value) => handleRadioChange("tratamentoCancer", value)}
                  className="flex space-x-6 mb-2"
                >
                  <div className="flex items-center space-x-3">
                    <RadioGroupItem value="sim" id="cancer-sim" className="custom-radio-square h-5 w-5" />
                    <Label htmlFor="cancer-sim" className="text-lg">
                      Sim
                    </Label>
                  </div>
                  <div className="flex items-center space-x-3">
                    <RadioGroupItem value="nao" id="cancer-nao" className="custom-radio-square h-5 w-5" />
                    <Label htmlFor="cancer-nao" className="text-lg">
                      Não
                    </Label>
                  </div>
                </RadioGroup>
                {!formData.tratamentoCancer && errors.includes("Pergunta 22 não respondida") && (
                  <p className="text-red-500 text-sm mt-1">Esta pergunta é obrigatória</p>
                )}
              </div>

              {/* Pergunta 23 */}
              <div
                className={`border-b pb-4 ${!formData.fumante && errors.includes("Pergunta 23 não respondida") ? "error-highlight" : ""}`}
              >
                <p className="font-medium mb-2 flex items-center">
                  23. Você é fumante? <span className="text-red-500 ml-1">*</span>
                </p>
                <RadioGroup
                  value={formData.fumante}
                  onValueChange={(value) => handleRadioChange("fumante", value)}
                  className="flex space-x-6 mb-2"
                >
                  <div className="flex items-center space-x-3">
                    <RadioGroupItem value="sim" id="fumante-sim" className="custom-radio-square h-5 w-5" />
                    <Label htmlFor="fumante-sim" className="text-lg">
                      Sim
                    </Label>
                  </div>
                  <div className="flex items-center space-x-3">
                    <RadioGroupItem value="nao" id="fumante-nao" className="custom-radio-square h-5 w-5" />
                    <Label htmlFor="fumante-nao" className="text-lg">
                      Não
                    </Label>
                  </div>
                </RadioGroup>
                {!formData.fumante && errors.includes("Pergunta 23 não respondida") && (
                  <p className="text-red-500 text-sm mt-1">Esta pergunta é obrigatória</p>
                )}

                {formData.fumante === "sim" && (
                  <div className="mt-2 pl-4">
                    <Label htmlFor="quantosCigarros" className="text-sm flex items-center">
                      Quantos cigarros por dia? <span className="text-red-500 ml-1">*</span>
                    </Label>
                    <Input
                      id="quantosCigarros"
                      value={formData.quantosCigarros}
                      onChange={(e) => handleInputChange("quantosCigarros", e.target.value)}
                      className={`border-2 anamnese-input ${formData.fumante === "sim" && !formData.quantosCigarros && errors.includes("Informe a quantidade de cigarros") ? "border-red-500" : ""}`}
                    />
                    {formData.fumante === "sim" &&
                      !formData.quantosCigarros &&
                      errors.includes("Informe a quantidade de cigarros") && (
                        <p className="text-red-500 text-sm mt-1">Este campo é obrigatório</p>
                      )}
                  </div>
                )}
              </div>

              {/* Pergunta 24 */}
              <div
                className={`border-b pb-4 ${!formData.drogas && errors.includes("Pergunta 24 não respondida") ? "error-highlight" : ""}`}
              >
                <p className="font-medium mb-2 flex items-center">
                  24. Faz uso ou já utilizou drogas? <span className="text-red-500 ml-1">*</span>
                </p>
                <RadioGroup
                  value={formData.drogas}
                  onValueChange={(value) => handleRadioChange("drogas", value)}
                  className="flex space-x-6 mb-2"
                >
                  <div className="flex items-center space-x-3">
                    <RadioGroupItem value="sim" id="drogas-sim" className="custom-radio-square h-5 w-5" />
                    <Label htmlFor="drogas-sim" className="text-lg">
                      Sim
                    </Label>
                  </div>
                  <div className="flex items-center space-x-3">
                    <RadioGroupItem value="nao" id="drogas-nao" className="custom-radio-square h-5 w-5" />
                    <Label htmlFor="drogas-nao" className="text-lg">
                      Não
                    </Label>
                  </div>
                </RadioGroup>
                {!formData.drogas && errors.includes("Pergunta 24 não respondida") && (
                  <p className="text-red-500 text-sm mt-1">Esta pergunta é obrigatória</p>
                )}

                {formData.drogas === "sim" && (
                  <div className="mt-2 pl-4">
                    <Label htmlFor="quaisDrogas" className="text-sm flex items-center">
                      Quais drogas? <span className="text-red-500 ml-1">*</span>
                    </Label>
                    <Input
                      id="quaisDrogas"
                      value={formData.quaisDrogas}
                      onChange={(e) => handleInputChange("quaisDrogas", e.target.value)}
                      className={`border-2 anamnese-input ${formData.drogas === "sim" && !formData.quaisDrogas && errors.includes("Informe quais drogas") ? "border-red-500" : ""}`}
                    />
                    {formData.drogas === "sim" && !formData.quaisDrogas && errors.includes("Informe quais drogas") && (
                      <p className="text-red-500 text-sm mt-1">Este campo é obrigatório</p>
                    )}
                  </div>
                )}
              </div>

              {/* Pergunta 25 */}
              <div
                className={`border-b pb-4 ${!formData.anestesiaOdontologica && errors.includes("Pergunta 25 não respondida") ? "error-highlight" : ""}`}
              >
                <p className="font-medium mb-2 flex items-center">
                  25. Já foi submetido a anestesia odontológica/bucal? <span className="text-red-500 ml-1">*</span>
                </p>
                <RadioGroup
                  value={formData.anestesiaOdontologica}
                  onValueChange={(value) => handleRadioChange("anestesiaOdontologica", value)}
                  className="flex space-x-6 mb-2"
                >
                  <div className="flex items-center space-x-3">
                    <RadioGroupItem value="sim" id="anestesia-sim" className="custom-radio-square h-5 w-5" />
                    <Label htmlFor="anestesia-sim" className="text-lg">
                      Sim
                    </Label>
                  </div>
                  <div className="flex items-center space-x-3">
                    <RadioGroupItem value="nao" id="anestesia-nao" className="custom-radio-square h-5 w-5" />
                    <Label htmlFor="anestesia-nao" className="text-lg">
                      Não
                    </Label>
                  </div>
                </RadioGroup>
                {!formData.anestesiaOdontologica && errors.includes("Pergunta 25 não respondida") && (
                  <p className="text-red-500 text-sm mt-1">Esta pergunta é obrigatória</p>
                )}

                {formData.anestesiaOdontologica === "sim" && (
                  <div className="mt-2 pl-4">
                    <Label htmlFor="reacaoAnestesia" className="text-sm flex items-center">
                      Teve alguma reação? Qual? <span className="text-red-500 ml-1">*</span>
                    </Label>
                    <Input
                      id="reacaoAnestesia"
                      value={formData.reacaoAnestesia}
                      onChange={(e) => handleInputChange("reacaoAnestesia", e.target.value)}
                      className={`border-2 anamnese-input ${formData.anestesiaOdontologica === "sim" && !formData.reacaoAnestesia && errors.includes("Informe a reação à anestesia") ? "border-red-500" : ""}`}
                    />
                    {formData.anestesiaOdontologica === "sim" &&
                      !formData.reacaoAnestesia &&
                      errors.includes("Informe a reação à anestesia") && (
                        <p className="text-red-500 text-sm mt-1">Este campo é obrigatório</p>
                      )}
                  </div>
                )}
              </div>

              {/* Pergunta 26 */}
              <div
                className={`border-b pb-4 ${!formData.traumaFace && errors.includes("Pergunta 26 não respondida") ? "error-highlight" : ""}`}
              >
                <p className="font-medium mb-2 flex items-center">
                  26. Já sofreu trauma na face? <span className="text-red-500 ml-1">*</span>
                </p>
                <RadioGroup
                  value={formData.traumaFace}
                  onValueChange={(value) => handleRadioChange("traumaFace", value)}
                  className="flex space-x-6 mb-2"
                >
                  <div className="flex items-center space-x-3">
                    <RadioGroupItem value="sim" id="trauma-sim" className="custom-radio-square h-5 w-5" />
                    <Label htmlFor="trauma-sim" className="text-lg">
                      Sim
                    </Label>
                  </div>
                  <div className="flex items-center space-x-3">
                    <RadioGroupItem value="nao" id="trauma-nao" className="custom-radio-square h-5 w-5" />
                    <Label htmlFor="trauma-nao" className="text-lg">
                      Não
                    </Label>
                  </div>
                </RadioGroup>
                {!formData.traumaFace && errors.includes("Pergunta 26 não respondida") && (
                  <p className="text-red-500 text-sm mt-1">Esta pergunta é obrigatória</p>
                )}
              </div>

              {/* Pergunta 27 */}
              <div
                className={`border-b pb-4 ${!formData.outrasDoencas && errors.includes("Pergunta 27 não respondida") ? "error-highlight" : ""}`}
              >
                <p className="font-medium mb-2 flex items-center">
                  27. Possui outras doenças não mencionadas? <span className="text-red-500 ml-1">*</span>
                </p>
                <RadioGroup
                  value={formData.outrasDoencas}
                  onValueChange={(value) => handleRadioChange("outrasDoencas", value)}
                  className="flex space-x-6 mb-2"
                >
                  <div className="flex items-center space-x-3">
                    <RadioGroupItem value="sim" id="outras-doencas-sim" className="custom-radio-square h-5 w-5" />
                    <Label htmlFor="outras-doencas-sim" className="text-lg">
                      Sim
                    </Label>
                  </div>
                  <div className="flex items-center space-x-3">
                    <RadioGroupItem value="nao" id="outras-doencas-nao" className="custom-radio-square h-5 w-5" />
                    <Label htmlFor="outras-doencas-nao" className="text-lg">
                      Não
                    </Label>
                  </div>
                </RadioGroup>
                {!formData.outrasDoencas && errors.includes("Pergunta 27 não respondida") && (
                  <p className="text-red-500 text-sm mt-1">Esta pergunta é obrigatória</p>
                )}

                {formData.outrasDoencas === "sim" && (
                  <div className="mt-2 pl-4">
                    <Label htmlFor="quaisOutrasDoencas" className="text-sm flex items-center">
                      Quais doenças? <span className="text-red-500 ml-1">*</span>
                    </Label>
                    <Input
                      id="quaisOutrasDoencas"
                      value={formData.quaisOutrasDoencas}
                      onChange={(e) => handleInputChange("quaisOutrasDoencas", e.target.value)}
                      className={`border-2 anamnese-input ${formData.outrasDoencas === "sim" && !formData.quaisOutrasDoencas && errors.includes("Informe quais outras doenças") ? "border-red-500" : ""}`}
                    />
                    {formData.outrasDoencas === "sim" &&
                      !formData.quaisOutrasDoencas &&
                      errors.includes("Informe quais outras doenças") && (
                        <p className="text-red-500 text-sm mt-1">Este campo é obrigatório</p>
                      )}
                  </div>
                )}
              </div>

              {/* Pergunta sobre Instagram */}
              <div className="border-b pb-4 mb-4">
                <p className="font-medium mb-2">Você possui Instagram?</p>
                <RadioGroup
                  value={formData.possuiInstagram}
                  onValueChange={(value) => handleRadioChange("possuiInstagram", value)}
                  className="flex gap-4"
                >
                  <div className="flex items-center space-x-3">
                    <RadioGroupItem value="sim" id="instagram-sim" className="custom-radio-square h-5 w-5" />
                    <Label htmlFor="instagram-sim" className="text-lg">
                      Sim
                    </Label>
                  </div>
                  <div className="flex items-center space-x-3">
                    <RadioGroupItem value="não" id="instagram-nao" className="custom-radio-square h-5 w-5" />
                    <Label htmlFor="instagram-nao" className="text-lg">
                      Não
                    </Label>
                  </div>
                </RadioGroup>

                {formData.possuiInstagram === "sim" && (
                  <div className="mt-4 pl-4">
                    <Label htmlFor="instagram" className="text-sm flex items-center">
                      Qual seu @? <span className="text-red-500 ml-1">*</span>
                    </Label>
                    <Input
                      id="instagram"
                      value={formData.instagram}
                      onChange={(e) => handleInputChange("instagram", e.target.value)}
                      placeholder="@seuusuario"
                      className="border-2 anamnese-input"
                    />
                  </div>
                )}
              </div>

              {/* Informações adicionais */}
              <div
                className={`border-b pb-4 ${!formData.motivoConsultaOpcao && errors.includes("Motivo da consulta é obrigatório") ? "error-highlight" : ""}`}
              >
                <p className="font-medium mb-2 flex items-center">
                  Motivo da consulta: <span className="text-red-500 ml-1">*</span>
                </p>
                <RadioGroup
                  value={formData.motivoConsultaOpcao}
                  onValueChange={(value) => {
                    handleRadioChange("motivoConsultaOpcao", value)
                    if (value !== "outros") {
                      setFormData({
                        ...formData,
                        motivoConsultaOpcao: value,
                        motivoConsulta: value,
                      })
                    }
                  }}
                  className="flex flex-wrap gap-4 mb-2"
                >
                  <div className="flex items-center space-x-3">
                    <RadioGroupItem value="rotina" id="motivo-rotina" className="custom-radio-square h-5 w-5" />
                    <Label htmlFor="motivo-rotina" className="text-lg">
                      Rotina
                    </Label>
                  </div>
                  <div className="flex items-center space-x-3">
                    <RadioGroupItem value="dor" id="motivo-dor" className="custom-radio-square h-5 w-5" />
                    <Label htmlFor="motivo-dor" className="text-lg">
                      Dor
                    </Label>
                  </div>
                  <div className="flex items-center space-x-3">
                    <RadioGroupItem value="emergencia" id="motivo-emergencia" className="custom-radio-square h-5 w-5" />
                    <Label htmlFor="motivo-emergencia" className="text-lg">
                      Emergência
                    </Label>
                  </div>
                  <div className="flex items-center space-x-3">
                    <RadioGroupItem value="outros" id="motivo-outros" className="custom-radio-square h-5 w-5" />
                    <Label htmlFor="motivo-outros" className="text-lg">
                      Outros
                    </Label>
                  </div>
                </RadioGroup>

                {formData.motivoConsultaOpcao === "outros" && (
                  <div className="mt-2 pl-4">
                    <Label htmlFor="motivoConsultaOutros" className="text-sm flex items-center">
                      Especifique: <span className="text-red-500 ml-1">*</span>
                    </Label>
                    <Input
                      id="motivoConsultaOutros"
                      value={formData.motivoConsultaOutros}
                      onChange={(e) => {
                        const value = e.target.value
                        setFormData({
                          ...formData,
                          motivoConsultaOutros: value,
                          motivoConsulta: value,
                        })
                      }}
                      className={`border-2 anamnese-input ${formData.motivoConsultaOpcao === "outros" && !formData.motivoConsultaOutros && errors.includes("Motivo da consulta é obrigatório") ? "border-red-500" : ""}`}
                    />
                  </div>
                )}

                {!formData.motivoConsultaOpcao && errors.includes("Motivo da consulta é obrigatório") && (
                  <p className="text-red-500 text-sm mt-1">Este campo é obrigatório</p>
                )}
                {formData.motivoConsultaOpcao === "outros" &&
                  !formData.motivoConsultaOutros &&
                  errors.includes("Motivo da consulta é obrigatório") && (
                    <p className="text-red-500 text-sm mt-1">Por favor, especifique o motivo</p>
                  )}
              </div>

              <div
                className={`pb-4 ${!formData.comoConheceuOpcao && errors.includes("Como nos conheceu é obrigatório") ? "error-highlight" : ""}`}
              >
                <p className="font-medium mb-2 flex items-center">
                  Como nos conheceu? <span className="text-red-500 ml-1">*</span>
                </p>
                <RadioGroup
                  value={formData.comoConheceuOpcao}
                  onValueChange={(value) => {
                    handleRadioChange("comoConheceuOpcao", value)
                    if (value !== "outros") {
                      setFormData({
                        ...formData,
                        comoConheceuOpcao: value,
                        comoConheceu: value,
                      })
                    }
                  }}
                  className="flex flex-wrap gap-4 mb-2"
                >
                  <div className="flex items-center space-x-3">
                    <RadioGroupItem value="google" id="conheceu-google" className="custom-radio-square h-5 w-5" />
                    <Label htmlFor="conheceu-google" className="text-lg">
                      Google
                    </Label>
                  </div>
                  <div className="flex items-center space-x-3">
                    <RadioGroupItem value="instagram" id="conheceu-instagram" className="custom-radio-square h-5 w-5" />
                    <Label htmlFor="conheceu-instagram" className="text-lg">
                      Instagram
                    </Label>
                  </div>
                  <div className="flex items-center space-x-3">
                    <RadioGroupItem value="indicacao" id="conheceu-indicacao" className="custom-radio-square h-5 w-5" />
                    <Label htmlFor="conheceu-indicacao" className="text-lg">
                      Indicação
                    </Label>
                  </div>
                  <div className="flex items-center space-x-3">
                    <RadioGroupItem value="outros" id="conheceu-outros" className="custom-radio-square h-5 w-5" />
                    <Label htmlFor="conheceu-outros" className="text-lg">
                      Outros
                    </Label>
                  </div>
                </RadioGroup>

                {formData.comoConheceuOpcao === "outros" && (
                  <div className="mt-2 pl-4">
                    <Label htmlFor="comoConheceuOutros" className="text-sm flex items-center">
                      Especifique: <span className="text-red-500 ml-1">*</span>
                    </Label>
                    <Input
                      id="comoConheceuOutros"
                      value={formData.comoConheceuOutros}
                      onChange={(e) => {
                        const value = e.target.value
                        setFormData({
                          ...formData,
                          comoConheceuOutros: value,
                          comoConheceu: value,
                        })
                      }}
                      className={`border-2 anamnese-input ${formData.comoConheceuOpcao === "outros" && !formData.comoConheceuOutros && errors.includes("Como nos conheceu é obrigatório") ? "border-red-500" : ""}`}
                    />
                  </div>
                )}

                {!formData.comoConheceuOpcao && errors.includes("Como nos conheceu é obrigatório") && (
                  <p className="text-red-500 text-sm mt-1">Este campo é obrigatório</p>
                )}
                {formData.comoConheceuOpcao === "outros" &&
                  !formData.comoConheceuOutros &&
                  errors.includes("Como nos conheceu é obrigatório") && (
                    <p className="text-red-500 text-sm mt-1">Por favor, especifique como nos conheceu</p>
                  )}
              </div>
            </div>
          </div>
        )

      case 3: // Assinatura
        return (
          <div className="text-left">
            <h2 className="text-xl font-semibold mb-4 text-center text-primary">ASSINATURA</h2>

            <div className="bg-gray-50 p-4 rounded-lg mb-6">
              <p className="text-gray-700">
                Declaro que li atentamente o questionário da anamnese e que o respondi de acordo com a verdade. Estou
                ciente de que o ocultamento de qualquer condição sobre minha saúde ou sobre o uso de algum
                medicamento/tratamento que eu esteja realizando, interfere no diagnóstico e tratamento odontológico.
              </p>
            </div>

            <div className="mt-8">
              <p className="text-center mb-2 font-medium flex items-center justify-center">
                Assine abaixo: <span className="text-red-500 ml-1">*</span>
              </p>
              <div className="border-2 border-gray-300 rounded-md h-48 bg-white w-full">
                <SignatureCanvas
                  ref={signatureRef}
                  canvasProps={{
                    width: 600,
                    height: 192,
                    className: "w-full h-full",
                  }}
                  backgroundColor="white"
                  dotSize={0.5}
                  minWidth={0.5}
                  maxWidth={1.5}
                />
              </div>
              <div className="flex justify-center mt-2">
                <Button type="button" variant="outline" onClick={clearSignature} className="text-sm">
                  Limpar assinatura
                </Button>
              </div>
            </div>
          </div>
        )

      case 4: // Agradecimento
        return (
          <div className="text-center">
            <div className="flex justify-center mb-6">
              <CheckCircle2 className="h-24 w-24 text-secondary checkmark-animation" />
            </div>

            <h2 className="text-xl font-semibold mb-4 text-secondary">Muito obrigado!</h2>
            <p className="mb-6 text-gray-700">
              Agradecemos por preencher a anamnese. Estas informações são muito importantes para o seu tratamento
              odontológico. Tenha um(a) excelente {timeOfDay}!
            </p>
          </div>
        )

      default:
        return null
    }
  }

  return (
    <div className="min-h-screen flex flex-col bg-white">
      {/* Progress bar */}
      <div className="w-full h-3 bg-gray-200">
        <div
          className="h-full bg-primary transition-all duration-300 ease-in-out"
          style={{ width: `${progressPercentage}%` }}
        />
      </div>

      {/* Header com logo e título */}
      <header className="w-full bg-white py-3">
        <div className="max-w-xl mx-auto w-full px-2">
          <div className="mb-2">
            <Image
              src="/assets/images/logo.png"
              alt="Vitall Check-UP Odontologia Logo"
              width={150}
              height={75}
              className="object-contain mx-auto"
            />
          </div>
        </div>
      </header>

      {/* Conteúdo principal */}
      <main className="flex-1 max-w-xl mx-auto w-full px-2 pt-4 pb-24 text-base">
        <div className="print-header" style={{ display: "none" }}>
          <h1 className="text-xl font-bold">VITALL CHECK-UP ODONTOLOGIA</h1>
          <h2 className="text-lg">ANAMNESE CLÍNICA</h2>
          <p className="text-sm">Data: {new Date().toLocaleDateString("pt-BR")}</p>
        </div>
        {renderStepContent()}
      </main>

      {/* Botões fixos na parte inferior */}
      <footer className="fixed bottom-0 left-0 right-0 bg-white py-3 print-hide">
        <div className="max-w-xl mx-auto w-full px-2 flex justify-between">
          {step > 0 && step < totalSteps ? (
            <Button variant="outline" onClick={handlePrevious} className="min-w-[120px] text-base py-5">
              Anterior
            </Button>
          ) : (
            <div /> // Empty div to maintain layout
          )}

          {step === 0 ? (
            <Button onClick={handleNext} className="min-w-[200px] py-5 text-lg" disabled={!formData.nome}>
              Iniciar
            </Button>
          ) : step < totalSteps - 1 ? (
            <Button onClick={handleNext} className="min-w-[200px] py-5 text-lg">
              Próximo
            </Button>
          ) : step === totalSteps - 1 ? (
            <Button
              onClick={saveAnamnese}
              className="bg-secondary hover:bg-secondary/90 text-white min-w-[200px] py-5 text-lg"
              disabled={isGeneratingPDF}
            >
              {isGeneratingPDF ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-t-2 border-b-2 border-white mr-2"></div>
                  Finalizando...
                </>
              ) : (
                "Finalizar"
              )}
            </Button>
          ) : (
            <div /> // Empty div on thank you screen
          )}
        </div>
      </footer>
    </div>
  )
}
