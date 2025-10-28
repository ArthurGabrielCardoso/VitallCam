const UVCCameraControl = require('./uvc-camera-control');
const SkycamDirectControl = require('./skycam-direct-control');

class CameraFocusIntegration {
  constructor() {
    this.uvcControl = new UVCCameraControl();
    this.skycamDirect = new SkycamDirectControl();
    this.isUVCAvailable = false;
    this.isSkycamDirectAvailable = false;
    this.focusCallbacks = [];
    this.currentSharpness = 0;
    this.targetSharpness = 50; // Valor alvo baseado nos logs
  }

  async initialize() {
    try {
      console.log('🚀 Inicializando sistema de controle de foco avançado...');
      
      // 1. Tentar controle direto Skycam (protocolo proprietário)
      this.isSkycamDirectAvailable = await this.skycamDirect.initialize();
      
      if (this.isSkycamDirectAvailable) {
        console.log('🎯 SUCESSO! Controle direto Skycam ativo!');
        console.log('   Protocolo proprietário descoberto via engenharia reversa');
        return true;
      }
      
      // 2. Fallback: Tentar controle UVC padrão
      this.isUVCAvailable = await this.uvcControl.initialize();
      
      if (this.isUVCAvailable) {
        console.log('✅ Controle UVC da câmera Skycam ativado!');
        
        // Obtém informações dos controles disponíveis
        const controls = await this.uvcControl.getAvailableControls();
        console.log('Controles disponíveis:', controls);
        
        // Obtém informações específicas de foco
        const focusInfo = await this.uvcControl.getFocusInfo();
        console.log('Informações de foco:', focusInfo);
        
        return true;
      } else {
        console.log('⚠️ Nenhum controle de foco disponível');
        console.log('💡 Usando sistema de fallback com sugestões manuais');
        return false;
      }
    } catch (error) {
      console.error('❌ Erro na inicialização do controle de foco:', error);
      return false;
    }
  }

  async enableAutoFocus() {
    if (this.isSkycamDirectAvailable) {
      console.log('🎯 Ativando autofoco via controle direto Skycam...');
      try {
        const focusValue = await this.skycamDirect.autoFocus();
        console.log('✅ Autofoco direto Skycam ativado');
        return true;
      } catch (error) {
        console.error('Erro no autofoco direto:', error);
      }
    }

    if (this.isUVCAvailable) {
      console.log('🔄 Tentando autofoco UVC...');
      try {
        await this.uvcControl.setAutoFocus(true);
        console.log('✅ Autofoco UVC ativado');
        return true;
      } catch (error) {
        console.error('Erro ao ativar autofoco UVC:', error);
      }
    }

    console.log('❌ Nenhum sistema de autofoco disponível');
    return false;
  }

  async setManualFocus(value) {
    if (this.isSkycamDirectAvailable) {
      console.log(`🎯 Definindo foco via controle direto: ${value}`);
      try {
        await this.skycamDirect.setFocus(value);
        console.log(`✅ Foco direto Skycam definido para: ${value}`);
        return true;
      } catch (error) {
        console.error('Erro no foco direto:', error);
      }
    }

    if (this.isUVCAvailable) {
      console.log(`🔄 Tentando foco UVC: ${value}`);
      try {
        await this.uvcControl.setFocus(value);
        console.log(`✅ Foco UVC definido para: ${value}`);
        return true;
      } catch (error) {
        console.error('Erro ao definir foco UVC:', error);
      }
    }

    console.log('❌ Nenhum controle de foco manual disponível');
    return false;
  }

  async smartAutoFocus(currentSharpness) {
    this.currentSharpness = currentSharpness;
    
    console.log(`🎯 Smart Autofocus: sharpness atual = ${currentSharpness}, alvo = ${this.targetSharpness}`);
    
    if (currentSharpness >= this.targetSharpness) {
      console.log('✅ Foco já está bom (sharpness adequada)');
      return true;
    }

    // Prioridade 1: Controle direto Skycam
    if (this.isSkycamDirectAvailable) {
      console.log('🎯 Usando controle direto Skycam para autofoco...');
      try {
        const bestFocus = await this.skycamDirect.autoFocus();
        if (bestFocus !== null) {
          console.log(`✅ Autofoco direto concluído: ${bestFocus}`);
          return true;
        }
      } catch (error) {
        console.error('Erro no autofoco direto:', error);
      }
    }

    // Prioridade 2: Controle UVC
    if (this.isUVCAvailable) {
      console.log('🔄 Usando controle UVC para autofocus...');
      try {
        const bestFocus = await this.findOptimalFocus();
        
        if (bestFocus !== null) {
          await this.setManualFocus(bestFocus);
          console.log(`✅ Foco UVC otimizado: ${bestFocus}`);
          return true;
        }
      } catch (error) {
        console.error('Erro no autofoco UVC:', error);
      }
    }

    // Fallback: Sistema manual
    console.log('❌ Smart autofocus não disponível - usando sistema original');
    return this.fallbackFocusSystem(currentSharpness);
  }

  async findOptimalFocus() {
    if (!this.isUVCAvailable) return null;

    try {
      console.log('🔍 Procurando foco ótimo...');
      
      // Testa diferentes distâncias de foco baseado nos logs do sistema original
      const testDistances = [
        { name: '10cm', value: 50 },   // Baseado nos logs
        { name: '15cm', value: 100 },
        { name: '20cm', value: 150 },
        { name: '25cm', value: 200 },
        { name: '30cm', value: 255 }
      ];

      let bestFocus = null;
      let bestSharpness = 0;

      for (const distance of testDistances) {
        try {
          console.log(`🧪 Testando foco: ${distance.name} (valor: ${distance.value})`);
          
          await this.uvcControl.setFocus(distance.value);
          
          // Aguarda estabilização
          await new Promise(resolve => setTimeout(resolve, 1000));
          
          // Aqui você conectaria com seu sistema de medição de sharpness
          // Por enquanto, simulamos uma verificação
          const measuredSharpness = await this.measureSharpness();
          
          console.log(`📊 Sharpness em ${distance.name}: ${measuredSharpness}`);
          
          if (measuredSharpness > bestSharpness) {
            bestSharpness = measuredSharpness;
            bestFocus = distance.value;
          }
          
        } catch (error) {
          console.error(`Erro testando distância ${distance.name}:`, error);
        }
      }

      if (bestFocus !== null) {
        console.log(`🎯 Melhor foco encontrado: ${bestFocus} (sharpness: ${bestSharpness})`);
      }

      return bestFocus;
    } catch (error) {
      console.error('Erro na busca de foco ótimo:', error);
      return null;
    }
  }

  async measureSharpness() {
    // Esta função deve ser integrada com seu sistema atual de medição de sharpness
    // Por enquanto retorna um valor simulado
    // Você pode conectar isso com a função que já calcula sharpness no seu código
    return Math.random() * 100;
  }

  fallbackFocusSystem(currentSharpness) {
    // Sistema de fallback quando UVC não está disponível
    console.log('📋 Usando sistema de foco original (fallback)');
    
    // Aqui você mantém a lógica original de autofoco
    // que já estava funcionando no seu sistema
    
    if (currentSharpness < this.targetSharpness) {
      console.log(`⚠️ Foco insuficiente: ${currentSharpness} < ${this.targetSharpness}`);
      console.log('💡 Sugestão: Ajuste manual do anel de foco da câmera Skycam');
      
      // Notifica os callbacks registrados
      this.notifyFocusCallbacks({
        type: 'manual_adjustment_needed',
        currentSharpness,
        targetSharpness: this.targetSharpness,
        suggestion: 'Gire o anel de foco da câmera para melhorar a nitidez'
      });
      
      return false;
    }
    
    return true;
  }

  onFocusChange(callback) {
    this.focusCallbacks.push(callback);
  }

  notifyFocusCallbacks(data) {
    this.focusCallbacks.forEach(callback => {
      try {
        callback(data);
      } catch (error) {
        console.error('Erro no callback de foco:', error);
      }
    });
  }

  async performFocusTest() {
    if (!this.isUVCAvailable) {
      console.log('❌ Teste de foco UVC não disponível');
      return;
    }

    try {
      console.log('🧪 Iniciando teste completo de foco...');
      
      // Testa range completo de foco
      const results = await this.uvcControl.scanFocusRange(0, 255, 20);
      
      console.log('📊 Resultados do teste de foco:', results);
      
      return results;
    } catch (error) {
      console.error('Erro no teste de foco:', error);
      return null;
    }
  }

  // Métodos para controle de flash
  async toggleFlash() {
    if (this.isSkycamDirectAvailable) {
      console.log('💡 Alternando flash via controle direto...');
      return await this.skycamDirect.toggleFlash();
    }
    
    console.log('❌ Controle de flash não disponível');
    return false;
  }

  async setFlash(enabled) {
    if (this.isSkycamDirectAvailable) {
      console.log(`💡 ${enabled ? 'Ligando' : 'Desligando'} flash via controle direto...`);
      return await this.skycamDirect.setFlash(enabled);
    }
    
    console.log('❌ Controle de flash não disponível');
    return false;
  }

  async getFlashStatus() {
    if (this.isSkycamDirectAvailable) {
      return await this.skycamDirect.getFlashStatus();
    }
    
    return null;
  }

  // Método para teste manual de foco
  async testManualFocus(value = 128) {
    console.log(`🧪 TESTE MANUAL DE FOCO: ${value}`);
    
    const success = await this.setManualFocus(value);
    
    if (success) {
      console.log('✅ Teste de foco manual realizado com sucesso!');
      
      // Notificar callbacks
      this.notifyFocusCallbacks({
        type: 'manual_test_success',
        focusValue: value,
        message: `Foco testado: ${value}`
      });
      
      return true;
    } else {
      console.log('❌ Teste de foco manual falhou');
      
      this.notifyFocusCallbacks({
        type: 'manual_test_failed',
        focusValue: value,
        message: 'Teste de foco falhou - verifique conexão'
      });
      
      return false;
    }
  }

  async disconnect() {
    if (this.skycamDirect) {
      this.skycamDirect.disconnect();
    }
    if (this.uvcControl) {
      this.uvcControl.disconnect();
    }
    console.log('🔌 Sistema de controle de foco desconectado');
  }
}

module.exports = CameraFocusIntegration;