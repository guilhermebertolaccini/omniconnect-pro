#!/bin/bash

# ============================================
# BotFlow Manager - Iniciar Ambiente Dev
# ============================================

set -e

# Cores
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

info() { echo -e "${BLUE}ℹ${NC} $1"; }
success() { echo -e "${GREEN}✓${NC} $1"; }
warning() { echo -e "${YELLOW}⚠${NC} $1"; }
error() { echo -e "${RED}✗${NC} $1"; }

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MICROSERVICE_PATH="$SCRIPT_DIR/wordpress-plugin/botflow-manager/microservice"
PIDS_FILE="$SCRIPT_DIR/.dev-pids"

echo ""
echo -e "${BLUE}╔════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║${NC}     🚀 BotFlow Manager - Ambiente de Dev           ${BLUE}║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════════════════╝${NC}"
echo ""

# ============================================
# Verificar XAMPP
# ============================================

info "Verificando XAMPP..."

# Verificar se Apache está rodando
if pgrep -x "httpd" > /dev/null; then
    success "Apache está rodando"
else
    warning "Apache não está rodando"
    echo ""
    echo "  Inicie o XAMPP primeiro:"
    echo "  → Abra XAMPP e clique em 'Start' para Apache"
    echo ""
    read -p "Pressione Enter após iniciar o Apache (ou Ctrl+C para cancelar)..."
fi

# Verificar se MySQL está rodando
if pgrep -x "mysqld" > /dev/null; then
    success "MySQL está rodando"
else
    warning "MySQL não está rodando"
    echo ""
    echo "  Inicie o MySQL no XAMPP:"
    echo "  → Abra XAMPP e clique em 'Start' para MySQL"
    echo ""
    read -p "Pressione Enter após iniciar o MySQL (ou Ctrl+C para cancelar)..."
fi

# ============================================
# Verificar portas
# ============================================

info "Verificando portas..."

# Porta 3001 (Microserviço)
if lsof -Pi :3001 -sTCP:LISTEN -t >/dev/null 2>&1; then
    warning "Porta 3001 já está em uso (microserviço pode já estar rodando)"
    read -p "Deseja matar o processo existente? (s/N): " KILL_3001
    if [[ "$KILL_3001" =~ ^[Ss]$ ]]; then
        lsof -ti:3001 | xargs kill -9 2>/dev/null || true
        success "Processo na porta 3001 encerrado"
    fi
fi

# Porta 5173 (Vite)
if lsof -Pi :5173 -sTCP:LISTEN -t >/dev/null 2>&1; then
    warning "Porta 5173 já está em uso (frontend pode já estar rodando)"
    read -p "Deseja matar o processo existente? (s/N): " KILL_5173
    if [[ "$KILL_5173" =~ ^[Ss]$ ]]; then
        lsof -ti:5173 | xargs kill -9 2>/dev/null || true
        success "Processo na porta 5173 encerrado"
    fi
fi

# ============================================
# Iniciar Microserviço
# ============================================

echo ""
info "Iniciando microserviço Node.js..."

cd "$MICROSERVICE_PATH"

# Verificar se .env existe
if [ ! -f ".env" ]; then
    error "Arquivo .env do microserviço não encontrado!"
    echo "Execute ./install.sh primeiro"
    exit 1
fi

# Iniciar em background
npm run dev > "$SCRIPT_DIR/.microservice.log" 2>&1 &
MICRO_PID=$!
echo "$MICRO_PID" > "$PIDS_FILE"

sleep 2

# Verificar se iniciou
if ps -p $MICRO_PID > /dev/null 2>&1; then
    success "Microserviço iniciado (PID: $MICRO_PID)"
else
    error "Falha ao iniciar microserviço. Verifique os logs:"
    echo "  cat $SCRIPT_DIR/.microservice.log"
    exit 1
fi

# ============================================
# Iniciar Frontend
# ============================================

echo ""
info "Iniciando frontend Vite..."

cd "$SCRIPT_DIR"

# Verificar se .env existe
if [ ! -f ".env" ]; then
    warning "Arquivo .env do frontend não encontrado. Usando valores padrão."
fi

# Iniciar em background
npm run dev > "$SCRIPT_DIR/.frontend.log" 2>&1 &
FRONT_PID=$!
echo "$FRONT_PID" >> "$PIDS_FILE"

sleep 3

# Verificar se iniciou
if ps -p $FRONT_PID > /dev/null 2>&1; then
    success "Frontend iniciado (PID: $FRONT_PID)"
else
    error "Falha ao iniciar frontend. Verifique os logs:"
    echo "  cat $SCRIPT_DIR/.frontend.log"
    exit 1
fi

# ============================================
# Resumo
# ============================================

echo ""
echo -e "${GREEN}╔════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║${NC}          ✅ Ambiente Iniciado!                      ${GREEN}║${NC}"
echo -e "${GREEN}╚════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "${BLUE}URLs de acesso:${NC}"
echo ""
echo "  🌐 Frontend:     http://localhost:5173"
echo "  ⚡ Microserviço: http://localhost:3001"
echo "  ❤️  Health:       http://localhost:3001/health"
echo ""
echo -e "${BLUE}Logs:${NC}"
echo ""
echo "  📋 Frontend:     tail -f .frontend.log"
echo "  📋 Microserviço: tail -f .microservice.log"
echo ""
echo -e "${BLUE}Para parar:${NC}"
echo ""
echo "  ./stop-dev.sh"
echo ""

# Perguntar se quer ver logs
read -p "Deseja ver os logs em tempo real? (s/N): " SHOW_LOGS
if [[ "$SHOW_LOGS" =~ ^[Ss]$ ]]; then
    echo ""
    info "Mostrando logs (Ctrl+C para sair)..."
    echo ""
    
    # Criar arquivo combinado de logs
    tail -f "$SCRIPT_DIR/.frontend.log" "$SCRIPT_DIR/.microservice.log"
fi
