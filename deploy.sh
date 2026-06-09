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

# Advertencias de seguridad para credenciales por defecto o inseguras
if [ "${POSTGRES_PASSWORD:-}" = "devpassword" ] || [ "${POSTGRES_PASSWORD:-}" = "postgres" ]; then
  red "⚠️  ADVERTENCIA DE SEGURIDAD: Se está utilizando una contraseña de base de datos por defecto o débil (POSTGRES_PASSWORD)."
fi
if [ "${JWT_SECRET:-}" = "dev_secret_32_chars_minimo_local_ok" ]; then
  red "⚠️  ADVERTENCIA DE SEGURIDAD: Se está utilizando el JWT_SECRET por defecto de desarrollo."
fi

cyan "── 1. Sincronizar fuente ──────────────────────"
if [ -d "$PROJECT_DIR/.git" ]; then
  cd "$PROJECT_DIR"
  git fetch origin main
  git reset --hard origin/main
else
  git clone "$REPO_URL" "$PROJECT_DIR"
  cd "$PROJECT_DIR"
fi

# Determinar hash del commit actual
COMMIT_HASH=$(git rev-parse --short HEAD)
export COMMIT_HASH

cyan "── 2. Construir imágenes (Commit: $COMMIT_HASH) ──"
if docker image inspect "enviosrh-api:$COMMIT_HASH" >/dev/null 2>&1 && \
   docker image inspect "enviosrh-web:$COMMIT_HASH" >/dev/null 2>&1; then
  green "✅ Las imágenes para el commit $COMMIT_HASH ya existen. Omitiendo construcción."
else
  docker compose build --parallel
fi

cyan "── 3. Asegurar red RenaceNet ──────────────────"
if ! docker network ls --format '{{.Name}}' | grep -qx "RenaceNet"; then
  docker network create --driver overlay --attachable RenaceNet
fi

cyan "── 4. Desplegar stack ($STACK_NAME → $DOMAIN) ─"
export DOMAIN
docker stack deploy --resolve-image never -c docker-compose.yml "$STACK_NAME"

cyan "── 5. Esperar a que los servicios arranquen ───"
sleep 8

cyan "── 6. Limpiar imágenes antiguas ───────────────"
# Eliminar imágenes antiguas de la stack que ya no coinciden con el commit actual ni son latest
docker image ls --format '{{.Repository}}:{{.Tag}}' | grep -E '^enviosrh-(web|api):' | while read -r repo_tag; do
  tag="${repo_tag##*:}"
  if [ "$tag" != "$COMMIT_HASH" ] && [ "$tag" != "latest" ]; then
    echo "Eliminando imagen antigua fuera de uso: $repo_tag"
    docker rmi "$repo_tag" 2>/dev/null || true
  fi
done

# Pruning general de imágenes huérfanas
docker image prune -f >/dev/null

green ""
green "✅  enviosrh desplegado."
green "    Sitio:  https://$DOMAIN"
green "    Logs:   docker service logs -f ${STACK_NAME}_api"
green "    Estado: docker stack services $STACK_NAME"

