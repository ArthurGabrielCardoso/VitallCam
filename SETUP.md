# VitallCam - Sistema de Gerenciamento de Câmera Intraoral

Sistema completo para captura e gestão de fotos intraorais usando Next.js 14, TypeScript, Tailwind CSS e Supabase.

## 🚀 Funcionalidades

### 📋 Gestão de Pacientes
- ✅ Criar paciente apenas com nome
- ✅ Listar pacientes em sidebar responsiva
- ✅ Busca de pacientes em tempo real
- ✅ Contador de fotos por paciente
- ✅ Navegação entre pacientes

### 📹 Captura de Câmera
- ✅ Detecção automática de câmera Skycam/intraoral
- ✅ Preview em tempo real da câmera
- ✅ Captura em alta resolução (1920x1080)
- ✅ Feedback visual com efeito flash
- ✅ Seleção manual de câmera se necessário
- ✅ Tratamento de erros robusto

### 🖼️ Galeria de Fotos
- ✅ Carregamento inicial de 5 fotos (lazy loading)
- ✅ Botão "Carregar mais" para próximas 5 fotos
- ✅ Scroll infinito automático
- ✅ Grid responsivo com hover effects
- ✅ Modal para visualização ampliada
- ✅ Funcionalidade de zoom, rotação e pan
- ✅ Download de fotos
- ✅ Exclusão com confirmação

### 🎨 Design
- ✅ Cores da clínica (turquesa #1db9b3 e dourado #c89d68)
- ✅ Interface responsiva e moderna
- ✅ Estados de loading e skeleton
- ✅ Notificações toast para feedback
- ✅ Sidebar colapsável
- ✅ Transições suaves

## 🛠️ Tecnologias

- **Frontend**: Next.js 14 com App Router
- **Linguagem**: TypeScript
- **Estilização**: Tailwind CSS + shadcn/ui
- **Banco de Dados**: Supabase
- **Ícones**: Lucide React
- **Notificações**: Sonner
- **Componentes**: shadcn/ui

## 📦 Instalação e Configuração

### 1. Configurar o Supabase

1. Acesse [Supabase](https://supabase.com) e crie um novo projeto
2. No painel do projeto, vá em **SQL Editor**
3. Execute o seguinte SQL para criar as tabelas:

```sql
-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create patients table
CREATE TABLE IF NOT EXISTS patients (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create photos table
CREATE TABLE IF NOT EXISTS photos (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  image_data TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_photos_patient_id ON photos(patient_id);
CREATE INDEX IF NOT EXISTS idx_photos_created_at ON photos(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_patients_created_at ON patients(created_at DESC);

-- Enable Row Level Security (RLS)
ALTER TABLE patients ENABLE ROW LEVEL SECURITY;
ALTER TABLE photos ENABLE ROW LEVEL SECURITY;

-- Create policies for public access (adjust as needed for production)
CREATE POLICY "Enable read access for all users" ON patients FOR SELECT USING (true);
CREATE POLICY "Enable insert access for all users" ON patients FOR INSERT WITH CHECK (true);
CREATE POLICY "Enable update access for all users" ON patients FOR UPDATE USING (true);
CREATE POLICY "Enable delete access for all users" ON patients FOR DELETE USING (true);

CREATE POLICY "Enable read access for all users" ON photos FOR SELECT USING (true);
CREATE POLICY "Enable insert access for all users" ON photos FOR INSERT WITH CHECK (true);
CREATE POLICY "Enable update access for all users" ON photos FOR UPDATE USING (true);
CREATE POLICY "Enable delete access for all users" ON photos FOR DELETE USING (true);
```

4. Vá em **Settings > API** e copie:
   - `Project URL`
   - `anon public` key

### 2. Configurar Variáveis de Ambiente

Edite o arquivo `.env.local` e substitua pelos seus dados do Supabase:

```env
NEXT_PUBLIC_SUPABASE_URL=https://seu-projeto.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=sua_anon_key_aqui
```

### 3. Executar o Projeto

```bash
# Instalar dependências (se ainda não fez)
npm install

# Executar em modo desenvolvimento
npm run dev
```

O sistema estará disponível em `http://localhost:3000`

## 🔧 Configuração da Câmera

### Câmeras Suportadas
- **Skycam** (detecção automática)
- **Outras câmeras intraorais USB**
- **Webcams convencionais** (fallback)

### Detecção Automática
O sistema procura automaticamente por dispositivos com:
- "skycam" no nome
- "intraoral" no nome
- "dental" no nome

### Permissões do Navegador
1. O navegador solicitará permissão para acessar a câmera
2. Clique em **Permitir** para usar o sistema
3. Se necessário, configure manualmente nas configurações do navegador

## 📱 Como Usar

### 1. Criar um Paciente
1. Na sidebar esquerda, digite o nome do paciente
2. Clique em **Novo Paciente**
3. O paciente aparecerá na lista

### 2. Selecionar Paciente
1. Clique no paciente desejado na sidebar
2. Você será direcionado para a página do paciente

### 3. Capturar Fotos
1. Conecte sua câmera intraoral Skycam via USB
2. O sistema detectará automaticamente
3. Clique em **Capturar Foto** quando pronto
4. A foto será salva automaticamente

### 4. Visualizar Fotos
1. As fotos aparecem na galeria à direita
2. Clique em uma foto para visualizar em tamanho completo
3. Use os controles para zoom, rotação e download
4. Delete fotos com o botão de lixeira (com confirmação)

## 🎯 Funcionalidades Avançadas

### Modal de Foto
- **Zoom**: Use os botões +/- ou scroll do mouse
- **Rotação**: Botão de rotação para girar 90°
- **Pan**: Arraste a imagem quando em zoom
- **Download**: Salva a foto no computador
- **Reset**: Volta às configurações originais

### Galeria
- **Lazy Loading**: Carrega 5 fotos inicialmente
- **Scroll Infinito**: Carrega mais fotos automaticamente
- **Responsiva**: Adapta-se a diferentes tamanhos de tela

### Sidebar
- **Busca**: Digite para filtrar pacientes
- **Contador**: Mostra quantas fotos cada paciente tem
- **Navegação**: Clique para alternar entre pacientes

## 🔐 Considerações de Segurança

### Para Produção
1. **Configure RLS mais restritivo** no Supabase
2. **Use HTTPS** sempre
3. **Implemente autenticação** se necessário
4. **Configure CORS** adequadamente
5. **Monitore uso de armazenamento**

### Backup de Dados
- As imagens são salvas em Base64 no Supabase
- Considere backup regular dos dados
- Monitore limites de armazenamento

## 🚀 Deploy

### Vercel (Recomendado)
1. Conecte seu repositório GitHub
2. Configure as variáveis de ambiente
3. Deploy automático

### Outras Plataformas
- **Netlify**: Suporte completo
- **Railway**: Ideal para full-stack
- **Docker**: Container pronto para uso

## 📞 Suporte Técnico

### Problemas Comuns

**Câmera não aparece:**
- Verifique se está conectada via USB
- Teste em outro navegador
- Verifique permissões do sistema operacional

**Erro de conexão Supabase:**
- Confirme as variáveis de ambiente
- Verifique se o projeto Supabase está ativo
- Confirme que as políticas RLS estão configuradas

**Performance lenta:**
- Considere otimizar imagens grandes
- Monitore uso de banda
- Use CDN para assets estáticos

### Contato
Para suporte técnico ou customizações, entre em contato com a equipe de desenvolvimento.

---

**Sistema desenvolvido especificamente para clínicas odontológicas** 🦷✨