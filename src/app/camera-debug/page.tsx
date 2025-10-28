'use client'

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'

export default function CameraDebugPage() {
  const [log, setLog] = useState<string[]>([])
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([])
  const [permissions, setPermissions] = useState<any>({})
  const [testing, setTesting] = useState(false)

  const addLog = (message: string) => {
    console.log(message)
    setLog(prev => [...prev, `[${new Date().toLocaleTimeString()}] ${message}`])
  }

  const runFullDiagnostic = async () => {
    setTesting(true)
    setLog([])
    addLog('🔍 INICIANDO DIAGNÓSTICO COMPLETO...\n')

    // 1. Verificar se API está disponível
    addLog('1️⃣ Verificando APIs de Mídia...')
    if (!navigator.mediaDevices) {
      addLog('❌ navigator.mediaDevices NÃO ESTÁ DISPONÍVEL!')
      addLog('   Este browser não suporta acesso a câmeras')
      setTesting(false)
      return
    }
    addLog('✅ navigator.mediaDevices está disponível\n')

    // 2. Verificar getUserMedia
    addLog('2️⃣ Verificando getUserMedia...')
    if (!navigator.mediaDevices.getUserMedia) {
      addLog('❌ getUserMedia NÃO ESTÁ DISPONÍVEL!')
      setTesting(false)
      return
    }
    addLog('✅ getUserMedia está disponível\n')

    // 3. Verificar enumerateDevices
    addLog('3️⃣ Verificando enumerateDevices...')
    if (!navigator.mediaDevices.enumerateDevices) {
      addLog('❌ enumerateDevices NÃO ESTÁ DISPONÍVEL!')
      setTesting(false)
      return
    }
    addLog('✅ enumerateDevices está disponível\n')

    // 4. Listar dispositivos SEM permissão
    addLog('4️⃣ Listando dispositivos (SEM permissão)...')
    try {
      const devicesBeforePermission = await navigator.mediaDevices.enumerateDevices()
      addLog(`   Encontrados: ${devicesBeforePermission.length} dispositivos`)
      devicesBeforePermission.forEach((device, index) => {
        addLog(`   ${index + 1}. ${device.kind}: "${device.label || 'SEM LABEL'}"`)
        addLog(`      ID: ${device.deviceId}`)
      })
      addLog('')
    } catch (error: any) {
      addLog(`❌ Erro ao listar dispositivos: ${error.message}\n`)
    }

    // 5. Solicitar permissões
    addLog('5️⃣ Solicitando permissões de câmera...')
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: false
      })
      addLog('✅ Permissão de câmera CONCEDIDA!')
      addLog(`   Stream ativo: ${stream.active}`)
      addLog(`   Tracks de vídeo: ${stream.getVideoTracks().length}`)

      if (stream.getVideoTracks().length > 0) {
        const track = stream.getVideoTracks()[0]
        addLog(`   Track label: "${track.label}"`)
        addLog(`   Track settings:`)
        const settings = track.getSettings()
        Object.entries(settings).forEach(([key, value]) => {
          addLog(`      ${key}: ${value}`)
        })
      }

      // Parar stream
      stream.getTracks().forEach(track => track.stop())
      addLog('')
    } catch (error: any) {
      addLog(`❌ ERRO ao solicitar permissão: ${error.name}`)
      addLog(`   Mensagem: ${error.message}`)
      addLog(`   Constraint: ${error.constraint || 'N/A'}\n`)
    }

    // 6. Listar dispositivos APÓS permissão
    addLog('6️⃣ Listando dispositivos (APÓS permissão)...')
    try {
      const devicesAfterPermission = await navigator.mediaDevices.enumerateDevices()
      setDevices(devicesAfterPermission)

      const videoDevices = devicesAfterPermission.filter(d => d.kind === 'videoinput')
      const audioDevices = devicesAfterPermission.filter(d => d.kind === 'audioinput')
      const audioOutputs = devicesAfterPermission.filter(d => d.kind === 'audiooutput')

      addLog(`   Total: ${devicesAfterPermission.length} dispositivos`)
      addLog(`   - Câmeras (videoinput): ${videoDevices.length}`)
      addLog(`   - Microfones (audioinput): ${audioDevices.length}`)
      addLog(`   - Alto-falantes (audiooutput): ${audioOutputs.length}\n`)

      addLog('📹 CÂMERAS DETECTADAS:')
      if (videoDevices.length === 0) {
        addLog('   ❌ NENHUMA CÂMERA DETECTADA!')
      } else {
        videoDevices.forEach((device, index) => {
          addLog(`   ${index + 1}. Label: "${device.label}"`)
          addLog(`      Device ID: ${device.deviceId}`)
          addLog(`      Group ID: ${device.groupId}`)
          addLog('')
        })
      }

      addLog('🎤 MICROFONES DETECTADOS:')
      if (audioDevices.length === 0) {
        addLog('   ❌ NENHUM MICROFONE DETECTADO!')
      } else {
        audioDevices.forEach((device, index) => {
          addLog(`   ${index + 1}. Label: "${device.label}"`)
          addLog(`      Device ID: ${device.deviceId}`)
          addLog('')
        })
      }

    } catch (error: any) {
      addLog(`❌ Erro ao listar dispositivos após permissão: ${error.message}\n`)
    }

    // 7. Testar cada câmera individualmente
    const videoDevices = devices.filter(d => d.kind === 'videoinput')
    if (videoDevices.length > 0) {
      addLog('7️⃣ Testando cada câmera individualmente...')

      for (let i = 0; i < videoDevices.length; i++) {
        const device = videoDevices[i]
        addLog(`\n   Testando câmera ${i + 1}: "${device.label}"`)

        try {
          const testStream = await navigator.mediaDevices.getUserMedia({
            video: { deviceId: { exact: device.deviceId } }
          })

          addLog(`   ✅ SUCESSO! Câmera funciona!`)
          addLog(`      Tracks: ${testStream.getVideoTracks().length}`)

          if (testStream.getVideoTracks().length > 0) {
            const track = testStream.getVideoTracks()[0]
            const settings = track.getSettings()
            addLog(`      Resolução: ${settings.width}x${settings.height}`)
            addLog(`      FPS: ${settings.frameRate}`)
          }

          testStream.getTracks().forEach(track => track.stop())

        } catch (error: any) {
          addLog(`   ❌ FALHOU: ${error.name} - ${error.message}`)
        }
      }
    }

    // 8. Informações do sistema
    addLog('\n8️⃣ Informações do Sistema:')
    addLog(`   User Agent: ${navigator.userAgent}`)
    addLog(`   Platform: ${navigator.platform}`)
    addLog(`   Language: ${navigator.language}`)
    addLog(`   Online: ${navigator.onLine}`)
    addLog(`   Cookie Enabled: ${navigator.cookieEnabled}`)

    addLog('\n✅ DIAGNÓSTICO COMPLETO!')
    setTesting(false)
  }

  useEffect(() => {
    runFullDiagnostic()
  }, [])

  return (
    <div className="min-h-screen bg-gray-100 p-8">
      <Card className="max-w-4xl mx-auto p-6">
        <h1 className="text-3xl font-bold mb-4 text-black">
          🔍 Diagnóstico de Câmera - TV Box
        </h1>

        <div className="mb-4">
          <Button
            onClick={runFullDiagnostic}
            disabled={testing}
            className="bg-primary hover:bg-primary/90"
          >
            {testing ? '⏳ Testando...' : '🔄 Executar Diagnóstico Novamente'}
          </Button>
        </div>

        <div className="bg-black text-green-400 p-4 rounded font-mono text-sm overflow-auto max-h-[600px]">
          {log.map((line, index) => (
            <div key={index} className="whitespace-pre-wrap">
              {line}
            </div>
          ))}
          {testing && (
            <div className="animate-pulse">▋</div>
          )}
        </div>

        {devices.length > 0 && (
          <div className="mt-6">
            <h2 className="text-xl font-bold mb-2 text-black">
              📊 Resumo de Dispositivos
            </h2>
            <div className="bg-white border rounded p-4">
              {devices.filter(d => d.kind === 'videoinput').map((device, index) => (
                <div key={index} className="mb-2 p-2 bg-blue-50 rounded">
                  <div className="font-bold text-black">
                    📹 Câmera {index + 1}: {device.label || 'Sem nome'}
                  </div>
                  <div className="text-sm text-gray-600">
                    ID: {device.deviceId.slice(0, 40)}...
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </Card>
    </div>
  )
}
