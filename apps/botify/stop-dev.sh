#!/bin/bash

# ============================================
# BotFlow Manager - Parar Ambiente Dev
# ============================================

# Cores
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

info() { echo -e "${BLUE}ℹ${NC} $1"; }
success() { echo -e "${GREEN}✓${NC} $1"; }
warning() { echo -e "${YELLOW}⚠${NC} $1"; }

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PIDS_FILE="$SCRIPT_DIR/.dev-pids"

echo ""
echo -e "${BLUE}╔════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║${NC}     🛑 BotFlow Manager - Parando Serviços          ${BLUE}║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════════════════╝${NC}"
echo ""

# ============================================
# Parar processos salvos
# ============================================

if [ -f "$PIDS_FILE" ]; then
    info "Parando processos salvos..."
    
    while read pid; do
        if ps -p $pid > /dev/null 2>&1; then
            kill $pid 2>/dev/null && success "Processo $pid encerrado"
        fi
    done < "$PIDS_FILE"
    
    rm "$PIDS_FILE"
else
    warning "Arquivo de PIDs não encontrado"
fi

# ============================================
# Parar por porta (fallback)
# ============================================

info "Verificando portas..."

# Porta 3001 (Microserviço)
if lsof -Pi :3001 -sTCP:LISTEN -t >/dev/null 2>&1; then
    lsof -ti:3001 | xargs kill -9 2>/dev/null
    success "Microserviço na porta 3001 encerrado"
else
    info "Porta 3001 já está livre"
fi

# Porta 5173 (Vite)
if lsof -Pi :5173 -sTCP:LISTEN -t >/dev/null 2>&1; then
    lsof -ti:5173 | xargs kill -9 2>/dev/null
    success "Frontend na porta 5173 encerrado"
else
    info "Porta 5173 já está livre"
fi

# ============================================
# Limpar logs (opcional)
# ============================================

echo ""
read -p "Deseja limpar os arquivos de log? (s/N): " CLEAR_LOGS
if [[ "$CLEAR_LOGS" =~ ^[Ss]$ ]]; then
    rm -f "$SCRIPT_DIR/.frontend.log" "$SCRIPT_DIR/.microservice.log"
    success "Logs removidos"
fi

echo ""
echo -e "${GREEN}✅ Todos os serviços foram encerrados${NC}"
echo ""
