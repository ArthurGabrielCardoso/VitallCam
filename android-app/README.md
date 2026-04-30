# VitallCam Android App

App Android nativo que resolve o problema de câmeras USB intraorais em tablets Samsung via cabo OTG (USB-C).

## Por que este app existe

O Chrome no Android **não suporta** câmeras USB externas via OTG na API `getUserMedia`. Este app resolve isso:

1. Abre o VitallCam como WebView
2. Detecta câmeras USB UVC conectadas via OTG
3. Captura frames da câmera USB nativamente (biblioteca AndroidUSBCamera)
4. Envia os frames ao WebView via WebSocket local (ws://localhost:8766)
5. O JavaScript injeto redireciona `getUserMedia` para usar esses frames

## Como compilar

### Pré-requisitos
- Android Studio Hedgehog (2023.1) ou superior
- JDK 17
- Android SDK 34

### Passos

1. Abra o Android Studio → **Open** → selecione a pasta `android-app/`
2. Edite `app/src/main/res/values/strings.xml` e altere `app_url` para a URL do seu Vercel:
   ```xml
   <string name="app_url">https://SEU-APP.vercel.app</string>
   ```
3. Clique em **Build → Generate Signed Bundle/APK**
4. Instale o APK no tablet Samsung

### Instalar via adb

```bash
adb install app/build/outputs/apk/release/app-release.apk
```

## Como funciona no tablet

1. Abra o app VitallCam no tablet
2. Conecte a câmera intraoral via cabo OTG (USB-C)
3. O Android mostrará uma caixa de diálogo pedindo permissão — toque em **OK**
4. O preview da câmera abre nativamente sobre o WebView
5. Toque em **Capturar Foto** — a foto é enviada ao web app via evento JS
6. Toque em **Fechar Câmera** para voltar ao modo normal

## Câmeras compatíveis

Qualquer câmera com driver **USB Video Class (UVC)**, que inclui a maioria das câmeras intraorais do mercado:
- Woodpecker, Eighteeth, Vatech, Carestream, Owandy
- Câmeras genéricas UVC (class 0x0E)

## Arquitetura

```
MainActivity
├── WebView (carrega o VitallCam web app)
├── UsbCameraManager (AndroidUSBCamera → frames NV21/JPEG)
├── FrameWebSocketServer (porta 8766 — broadcast de frames)
└── WebAppInterface (ponte JS ↔ Kotlin via @JavascriptInterface)
    └── injectCameraBridgeScript() — sobrescreve getUserMedia no browser
```
