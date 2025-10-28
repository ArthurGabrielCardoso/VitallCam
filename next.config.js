/** @type {import('next').NextConfig} */
const nextConfig = {
  eslint: {
    ignoreDuringBuilds: true,
  },
  // DESABILITAR CACHE para Android TV Box
  experimental: {
    staleTimes: {
      dynamic: 0,
      static: 0,
    },
  },
  // Headers anti-cache
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          {
            key: 'Cache-Control',
            value: 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0',
          },
          {
            key: 'Pragma',
            value: 'no-cache',
          },
          {
            key: 'Expires',
            value: '0',
          },
        ],
      },
    ]
  },
  // Otimizações de performance
  swcMinify: true,
  reactStrictMode: true,
  // Compatibilidade com Android 7.1.2 (Chrome antigo)
  compiler: {
    // Remover console.logs em produção (opcional)
    // removeConsole: process.env.NODE_ENV === 'production',
  },
  // Configurar para transpilar para navegadores antigos
  transpilePackages: [],
  // Configurações para melhor performance de imagens
  images: {
    formats: ['image/webp', 'image/avif'],
    deviceSizes: [640, 768, 1024, 1280, 1600],
    imageSizes: [16, 32, 48, 64, 96, 128, 256, 384],
  },
  // Configuração webpack para excluir módulos Node.js do bundle do cliente
  webpack: (config, { isServer }) => {
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        path: false,
        crypto: false,
        stream: false,
        util: false,
        buffer: false,
        events: false,
        'uvc-control': false,
        'usb': false,
      };
      
      // Ignorar módulos Node.js no cliente
      config.externals = {
        ...config.externals,
        'uvc-control': 'uvc-control',
        'usb': 'usb',
      };
    }
    
    return config;
  },
}

module.exports = nextConfig