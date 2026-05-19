#!/bin/bash

# ============================================
# BotFlow Manager - Script de Instalação
# Para XAMPP no macOS
# ============================================

set -e

# Cores para output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Funções de output
info() { echo -e "${BLUE}ℹ${NC} $1"; }
success() { echo -e "${GREEN}✓${NC} $1"; }
warning() { echo -e "${YELLOW}⚠${NC} $1"; }
error() { echo -e "${RED}✗${NC} $1"; }

# Banner
echo ""
echo -e "${BLUE}╔════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║${NC}     🤖 BotFlow Manager - Instalação Automática     ${BLUE}║${NC}"
echo -e "${BLUE}║${NC}              Para XAMPP no macOS                   ${BLUE}║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════════════════╝${NC}"
echo ""

# ============================================
# Verificações de Sistema
# ============================================

info "Verificando sistema operacional..."
if [[ "$OSTYPE" != "darwin"* ]]; then
    error "Este script foi projetado para macOS. Detectado: $OSTYPE"
    exit 1
fi
success "macOS detectado"

# Verificar XAMPP
info "Procurando instalação do XAMPP..."
XAMPP_PATH="/Applications/XAMPP"
HTDOCS_PATH="$XAMPP_PATH/xamppfiles/htdocs"

if [ ! -d "$XAMPP_PATH" ]; then
    error "XAMPP não encontrado em $XAMPP_PATH"
    echo ""
    echo "Por favor, instale o XAMPP primeiro:"
    echo "https://www.apachefriends.org/download.html"
    exit 1
fi
success "XAMPP encontrado em $XAMPP_PATH"

# Verificar Node.js
info "Verificando Node.js..."
if ! command -v node &> /dev/null; then
    error "Node.js não encontrado"
    echo ""
    echo "Por favor, instale o Node.js (>= 18):"
    echo "https://nodejs.org/ ou via Homebrew: brew install node"
    exit 1
fi

NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 18 ]; then
    error "Node.js versão 18+ é necessária. Versão atual: $(node -v)"
    exit 1
fi
success "Node.js $(node -v) encontrado"

# Verificar npm
info "Verificando npm..."
if ! command -v npm &> /dev/null; then
    error "npm não encontrado"
    exit 1
fi
success "npm $(npm -v) encontrado"

# ============================================
# Configuração do WordPress
# ============================================

echo ""
echo -e "${BLUE}═══════════════════════════════════════════════════════${NC}"
echo -e "${BLUE}  Configuração do WordPress${NC}"
echo -e "${BLUE}═══════════════════════════════════════════════════════${NC}"
echo ""

# Listar sites WordPress disponíveis
info "Sites WordPress encontrados em htdocs:"
echo ""

WP_SITES=()
for dir in "$HTDOCS_PATH"/*/; do
    if [ -f "${dir}wp-config.php" ]; then
        site_name=$(basename "$dir")
        WP_SITES+=("$site_name")
        echo "  • $site_name"
    fi
done

if [ ${#WP_SITES[@]} -eq 0 ]; then
    warning "Nenhum site WordPress encontrado em $HTDOCS_PATH"
    echo ""
    read -p "Digite o nome do diretório do seu WordPress: " WP_DIR
else
    echo ""
    read -p "Digite o nome do site WordPress (ou pressione Enter para '${WP_SITES[0]}'): " WP_DIR
    WP_DIR=${WP_DIR:-${WP_SITES[0]}}
fi

WP_FULL_PATH="$HTDOCS_PATH/$WP_DIR"
PLUGINS_PATH="$WP_FULL_PATH/wp-content/plugins"

if [ ! -d "$WP_FULL_PATH" ]; then
    error "Diretório não encontrado: $WP_FULL_PATH"
    exit 1
fi

if [ ! -f "$WP_FULL_PATH/wp-config.php" ]; then
    warning "wp-config.php não encontrado. Tem certeza que é um WordPress?"
    read -p "Continuar mesmo assim? (s/N): " CONTINUE
    if [[ ! "$CONTINUE" =~ ^[Ss]$ ]]; then
        exit 1
    fi
fi

success "WordPress selecionado: $WP_DIR"

# ============================================
# URL do WordPress
# ============================================

echo ""
read -p "URL do WordPress local (padrão: http://localhost/$WP_DIR): " WP_URL
WP_URL=${WP_URL:-"http://localhost/$WP_DIR"}

# Remover barra final se existir
WP_URL=${WP_URL%/}

success "URL configurada: $WP_URL"

# ============================================
# Criar Symlink do Plugin
# ============================================

echo ""
echo -e "${BLUE}═══════════════════════════════════════════════════════${NC}"
echo -e "${BLUE}  Instalação do Plugin${NC}"
echo -e "${BLUE}═══════════════════════════════════════════════════════${NC}"
echo ""

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PLUGIN_SOURCE="$SCRIPT_DIR/wordpress-plugin/botflow-manager"
PLUGIN_DEST="$PLUGINS_PATH/botflow-manager"

if [ ! -d "$PLUGIN_SOURCE" ]; then
    error "Pasta do plugin não encontrada: $PLUGIN_SOURCE"
    exit 1
fi

info "Criando symlink do plugin..."

if [ -L "$PLUGIN_DEST" ]; then
    warning "Symlink já existe. Removendo..."
    rm "$PLUGIN_DEST"
elif [ -d "$PLUGIN_DEST" ]; then
    warning "Diretório do plugin já existe."
    read -p "Deseja substituir por symlink? (S/n): " REPLACE
    if [[ ! "$REPLACE" =~ ^[Nn]$ ]]; then
        rm -rf "$PLUGIN_DEST"
    else
        error "Instalação cancelada"
        exit 1
    fi
fi

ln -s "$PLUGIN_SOURCE" "$PLUGIN_DEST"
success "Symlink criado: $PLUGIN_DEST → $PLUGIN_SOURCE"

# ============================================
# Configuração do Microserviço
# ============================================

echo ""
echo -e "${BLUE}═══════════════════════════════════════════════════════${NC}"
echo -e "${BLUE}  Configuração do Microserviço${NC}"
echo -e "${BLUE}═══════════════════════════════════════════════════════${NC}"
echo ""

MICROSERVICE_PATH="$PLUGIN_SOURCE/microservice"
MICROSERVICE_ENV="$MICROSERVICE_PATH/.env"

# Gerar JWT_SECRET
JWT_SECRET=$(openssl rand -base64 32)

# Perguntar sobre chaves de API (opcional)
echo "Configuração de chaves de API (opcional - pode configurar depois):"
echo ""

read -p "OpenAI API Key (Enter para pular): " OPENAI_KEY
read -p "Google Gemini API Key (Enter para pular): " GEMINI_KEY

# Criar .env do microserviço
info "Criando arquivo .env do microserviço..."

if [ -f "$MICROSERVICE_ENV" ]; then
    warning "Arquivo .env já existe. Criando backup..."
    cp "$MICROSERVICE_ENV" "$MICROSERVICE_ENV.backup.$(date +%Y%m%d%H%M%S)"
fi

cat > "$MICROSERVICE_ENV" << EOF
# BotFlow Manager Microservice - Configuração
# Gerado automaticamente em $(date)

# Servidor
PORT=3001
NODE_ENV=development

# WordPress
WORDPRESS_URL=$WP_URL
WORDPRESS_API_URL=$WP_URL/wp-json

# JWT (deve ser igual ao configurado no WordPress)
JWT_SECRET=$JWT_SECRET

# OpenAI (opcional)
OPENAI_API_KEY=${OPENAI_KEY:-your_openai_api_key_here}

# Google Gemini (opcional)
GEMINI_API_KEY=${GEMINI_KEY:-your_gemini_api_key_here}

# Rate Limiting
RATE_LIMIT_WINDOW_MS=60000
RATE_LIMIT_MAX_REQUESTS=100

# Logging
LOG_LEVEL=debug
EOF

success "Arquivo .env do microserviço criado"

# ============================================
# Configuração do Frontend
# ============================================

echo ""
echo -e "${BLUE}═══════════════════════════════════════════════════════${NC}"
echo -e "${BLUE}  Configuração do Frontend${NC}"
echo -e "${BLUE}═══════════════════════════════════════════════════════${NC}"
echo ""

FRONTEND_ENV="$SCRIPT_DIR/.env"

info "Criando arquivo .env do frontend..."

if [ -f "$FRONTEND_ENV" ]; then
    warning "Arquivo .env já existe. Criando backup..."
    cp "$FRONTEND_ENV" "$FRONTEND_ENV.backup.$(date +%Y%m%d%H%M%S)"
fi

cat > "$FRONTEND_ENV" << EOF
# BotFlow Manager Frontend - Configuração
# Gerado automaticamente em $(date)

# WordPress REST API
VITE_WORDPRESS_API_URL=$WP_URL/wp-json

# Microserviço Node.js
VITE_MICROSERVICE_URL=http://localhost:3001
EOF

success "Arquivo .env do frontend criado"

# ============================================
# Instalar Dependências
# ============================================

echo ""
echo -e "${BLUE}═══════════════════════════════════════════════════════${NC}"
echo -e "${BLUE}  Instalação de Dependências${NC}"
echo -e "${BLUE}═══════════════════════════════════════════════════════${NC}"
echo ""

# Frontend
info "Instalando dependências do frontend..."
cd "$SCRIPT_DIR"
npm install
success "Dependências do frontend instaladas"

# Microserviço
info "Instalando dependências do microserviço..."
cd "$MICROSERVICE_PATH"
npm install
success "Dependências do microserviço instaladas"

cd "$SCRIPT_DIR"

# ============================================
# Instruções Finais
# ============================================

echo ""
echo -e "${GREEN}╔════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║${NC}          ✅ Instalação Concluída!                   ${GREEN}║${NC}"
echo -e "${GREEN}╚════════════════════════════════════════════════════╝${NC}"
echo ""

echo -e "${BLUE}Próximos passos:${NC}"
echo ""
echo "  1. Inicie o XAMPP (Apache + MySQL)"
echo ""
echo "  2. Ative o plugin no WordPress:"
echo "     → Acesse: $WP_URL/wp-admin/plugins.php"
echo "     → Ative 'BotFlow Manager'"
echo ""
echo "  3. Configure o JWT Secret no WordPress:"
echo "     → Adicione ao wp-config.php:"
echo "     define('BOTFLOW_JWT_SECRET', '$JWT_SECRET');"
echo ""
echo "  4. Inicie o ambiente de desenvolvimento:"
echo "     ./start-dev.sh"
echo ""
echo -e "${BLUE}URLs de acesso:${NC}"
echo "  • Frontend:     http://localhost:5173"
echo "  • WordPress:    $WP_URL"
echo "  • Microserviço: http://localhost:3001"
echo "  • API Health:   http://localhost:3001/health"
echo ""

# Perguntar se quer iniciar agora
read -p "Deseja iniciar o ambiente de desenvolvimento agora? (S/n): " START_NOW
if [[ ! "$START_NOW" =~ ^[Nn]$ ]]; then
    exec ./start-dev.sh
fi
