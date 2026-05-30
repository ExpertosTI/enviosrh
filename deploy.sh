#!/usr/bin/env bash
# ── enviosrh — Renace Protocol deploy.sh ─────────────────────
#  Uso en el VPS:
#      cd /opt/enviosrh && ./deploy.sh
#  Primera vez: clona el repo en PROJECT_DIR y despliega.

set -euo pipefail

REPO_URL="${REPO_URL:-https://github.com/ExpertosTI/enviosrh.git}"
PROJECT_DIR="${PROJECT_DIR:-/opt/enviosrh}"
STACK_NAME="${STACK_NAME:-enviosrh}"
DOMAIN="${DOMAIN:-enviosrh.renace.tech}"

cyan()  { printf "\033[36m%s\033[0m\n" "$*"; }
green() { printf "\033[32m%s\033[0m\n" "$*"; }
red()   { printf "\033[31m%s\033[0m\n" "$*"; }

# ── 0. Validar .env ─────────────────────────────────────────
if [ ! -f "$PROJECT_DIR/.env" ]; then
  red "❌ Falta .env en $PROJECT_DIR"
  echo "   Copia .env.example → .env y configura las variables."
  exit 1
fi

set -a; source "$PROJECT_DIR/.env"; set +a

# Validar secretos obligatorios
for VAR in POSTGRES_PASSWORD JWT_SECRET; do
  if [ -z "${!VAR:-}" ]; then
    red "❌ Variable $VAR no está configurada en .env"
    exit 1
  fi
done

cyan "── 1. Sincronizar fuente ──────────────────────"
if [ -d "$PROJECT_DIR/.git" ]; then
  cd "$PROJECT_DIR"
  git fetch origin main
  git reset --hard origin/main
else
  git clone "$REPO_URL" "$PROJECT_DIR"
  cd "$PROJECT_DIR"
fi

cyan "── 2. Construir imágenes ──────────────────────"
docker compose build --parallel

cyan "── 3. Asegurar red RenaceNet ──────────────────"
if ! docker network ls --format '{{.Name}}' | grep -qx "RenaceNet"; then
  docker network create --driver overlay --attachable RenaceNet
fi

cyan "── 4. Desplegar stack ($STACK_NAME → $DOMAIN) ─"
export DOMAIN
docker stack deploy -c docker-compose.yml "$STACK_NAME"

cyan "── 5. Esperar a que los servicios arranquen ───"
sleep 8

cyan "── 6. Forzar rollout (imagen nueva) ───────────"
for SVC in web api; do
  docker service update --force "${STACK_NAME}_${SVC}" >/dev/null 2>&1 || true
done

cyan "── 7. Limpiar imágenes huérfanas ──────────────"
docker image prune -f >/dev/null

green ""
green "✅  enviosrh desplegado."
green "    Sitio:  https://$DOMAIN"
green "    Logs:   docker service logs -f ${STACK_NAME}_api"
green "    Estado: docker stack services $STACK_NAME"
