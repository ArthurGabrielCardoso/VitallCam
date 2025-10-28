// Importações condicionais para evitar erros no browser
let UVCControl, usb;

if (typeof window === 'undefined') {
  // Apenas no servidor/Node.js
  try {
    UVCControl = require('uvc-control');
    usb = require('usb');
  } catch (error) {
    console.log('⚠️ Bibliotecas UVC não disponíveis:', error.message);
  }
}

class UVCCameraControl {
  constructor() {
    this.camera = null;
    this.isConnected = false;
  }

  async initialize() {
    // Verificar se estamos no browser
    if (typeof window !== 'undefined') {
      console.log('⚠️ Controle UVC não disponível no browser');
      return false;
    }

    // Verificar se as bibliotecas foram carregadas
    if (!UVCControl || !usb) {
      console.log('❌ Bibliotecas UVC não carregadas');
      return false;
    }

    try {
      console.log('🔍 Procurando câmeras UVC...');
      
      // Listar todos os dispositivos USB conectados
      const devices = usb.getDeviceList();
      console.log(`📱 Total de dispositivos USB: ${devices.length}`);
      
      // Filtrar dispositivos que podem ser câmeras
      const potentialCameras = devices.filter(device => {
        const desc = device.deviceDescriptor;
        // Classe 0x0E = Video Device Class
        return desc.bDeviceClass === 0x0E || 
               desc.bDeviceClass === 0x00; // Classe 0 pode ter interfaces de vídeo
      });
      
      console.log(`📹 Dispositivos de vídeo encontrados: ${potentialCameras.length}`);
      
      if (potentialCameras.length === 0) {
        console.log('❌ Nenhum dispositivo de vídeo UVC detectado');
        console.log('💡 Sua câmera Skycam pode não ser compatível com UVC padrão');
        return false;
      }

      // Tentar conectar com cada dispositivo de vídeo
      for (const device of potentialCameras) {
        const desc = device.deviceDescriptor;
        const vid = desc.idVendor;
        const pid = desc.idProduct;
        
        console.log(`🎯 Testando câmera VID:${vid.toString(16)} PID:${pid.toString(16)}`);
        
        try {
          // Tentar criar controle UVC para este dispositivo
          const camera = new UVCControl(vid, pid);
          
          // Testar se é realmente uma câmera UVC funcional
          if (camera.device && camera.interfaceNumber !== undefined) {
            console.log('✅ Câmera UVC compatível encontrada!');
            this.camera = camera;
            this.isConnected = true;
            
            console.log(`📷 Conectado - VID: 0x${vid.toString(16)}, PID: 0x${pid.toString(16)}`);
            return true;
          } else {
            console.log(`⚠️ Dispositivo não é UVC compatível`);
            if (camera.device) {
              camera.close();
            }
          }
        } catch (error) {
          console.log(`❌ Erro ao testar dispositivo: ${error.message}`);
        }
      }
      
      console.log('❌ Nenhuma câmera UVC compatível encontrada');
      console.log('💡 Sua Skycam provavelmente usa protocolo proprietário');
      return false;
      
    } catch (error) {
      console.error('❌ Erro geral na inicialização UVC:', error);
      return false;
    }
  }

  async getAvailableControls() {
    if (!this.isConnected || !this.camera) {
      throw new Error('Câmera não conectada');
    }

    if (!UVCControl) {
      return {};
    }

    return new Promise((resolve) => {
      try {
        // Lista todos os controles disponíveis da biblioteca uvc-control
        const controls = UVCControl.controls;
        console.log('🎛️ Controles UVC suportados:', controls);

        const availableControls = {};
        let completed = 0;
        const total = controls.length;
        
        if (total === 0) {
          resolve(availableControls);
          return;
        }
        
        for (const control of controls) {
          this.camera.get(control, (error, value) => {
            if (!error) {
              availableControls[control] = {
                current: value,
                available: true
              };
              console.log(`✅ ${control}: ${value}`);
            } else {
              availableControls[control] = {
                available: false,
                error: error.message
              };
              console.log(`❌ ${control}: ${error.message}`);
            }
            
            completed++;
            if (completed === total) {
              resolve(availableControls);
            }
          });
        }
      } catch (error) {
        console.error('Erro ao obter controles:', error);
        resolve({});
      }
    });
  }

  async getFocusInfo() {
    if (!this.isConnected || !this.camera) {
      throw new Error('Câmera não conectada');
    }

    return new Promise((resolve) => {
      const focusInfo = {};
      let completed = 0;
      const tests = ['autoFocus', 'absoluteFocus'];
      
      // Função para finalizar quando todos os testes completarem
      const checkComplete = () => {
        completed++;
        if (completed === tests.length + 1) { // +1 para o range test
          resolve(focusInfo);
        }
      };
      
      // Testar autofoco
      this.camera.get('autoFocus', (error, value) => {
        focusInfo.autoFocus = error ? 'não disponível' : value;
        if (!error) console.log(`✅ Autofoco: ${value}`);
        checkComplete();
      });
      
      // Testar foco absoluto
      this.camera.get('absoluteFocus', (error, value) => {
        focusInfo.absoluteFocus = error ? 'não disponível' : value;
        if (!error) console.log(`✅ Foco absoluto: ${value}`);
        checkComplete();
      });
      
      // Testar range do foco
      this.camera.range('absoluteFocus', (error, range) => {
        focusInfo.focusRange = error ? 'não disponível' : range;
        if (!error) console.log(`✅ Range de foco: ${range[0]} - ${range[1]}`);
        checkComplete();
      });
    });
  }

  async setAutoFocus(enabled) {
    if (!this.isConnected || !this.camera) {
      throw new Error('Câmera não conectada');
    }

    return new Promise((resolve, reject) => {
      this.camera.set('autoFocus', enabled ? 1 : 0, (error) => {
        if (error) {
          console.error('Erro ao definir autofoco:', error);
          reject(error);
        } else {
          console.log(`✅ Autofoco ${enabled ? 'ativado' : 'desativado'}`);
          resolve(true);
        }
      });
    });
  }

  async setFocus(value) {
    if (!this.isConnected || !this.camera) {
      throw new Error('Câmera não conectada');
    }

    return new Promise((resolve, reject) => {
      // Primeiro desativa o autofoco
      this.camera.set('autoFocus', 0, (autoFocusError) => {
        if (autoFocusError) {
          console.warn('⚠️ Não foi possível desativar autofoco:', autoFocusError.message);
        }

        // Define o foco absoluto
        this.camera.set('absoluteFocus', value, (focusError) => {
          if (focusError) {
            console.error('❌ Erro ao definir foco:', focusError);
            reject(focusError);
          } else {
            console.log(`✅ Foco definido para: ${value}`);
            resolve(true);
          }
        });
      });
    });
  }

  async autoFocusStep(step = 10) {
    if (!this.isConnected || !this.camera) {
      throw new Error('Câmera não conectada');
    }

    try {
      const currentFocus = this.camera.get('absoluteFocus');
      const newFocus = currentFocus + step;
      
      await this.setFocus(newFocus);
      return newFocus;
    } catch (error) {
      console.error('Erro no step de autofoco:', error);
      throw error;
    }
  }

  async scanFocusRange(min = 0, max = 255, steps = 10) {
    if (!this.isConnected || !this.camera) {
      throw new Error('Câmera não conectada');
    }

    const focusValues = [];
    const stepSize = (max - min) / steps;

    for (let i = 0; i <= steps; i++) {
      const focusValue = Math.round(min + (i * stepSize));
      
      try {
        await this.setFocus(focusValue);
        
        // Aguarda um momento para a câmera ajustar
        await new Promise(resolve => setTimeout(resolve, 500));
        
        focusValues.push({
          value: focusValue,
          timestamp: Date.now()
        });
        
        console.log(`Teste de foco: ${focusValue}`);
      } catch (error) {
        console.error(`Erro no foco ${focusValue}:`, error);
      }
    }

    return focusValues;
  }

  disconnect() {
    if (this.camera && this.camera.close) {
      try {
        this.camera.close();
      } catch (error) {
        console.warn('Erro ao fechar câmera UVC:', error);
      }
    }
    this.isConnected = false;
    this.camera = null;
    console.log('Desconectado da câmera UVC');
  }
}

module.exports = UVCCameraControl;