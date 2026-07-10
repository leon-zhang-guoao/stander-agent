#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
ENV_FILE="${STANDER_ENV_FILE:-${PROJECT_ROOT}/.env}"

if [[ -f "${ENV_FILE}" ]]; then
  set -a
  # shellcheck disable=SC1091
  source "${ENV_FILE}"
  set +a
fi

HOST="${HOST:-0.0.0.0}"
PORT="${PORT:-8787}"
STANDER_DATA_DIR="${STANDER_DATA_DIR:-.stander}"

if [[ "${STANDER_DATA_DIR}" = /* ]]; then
  DATA_DIR="${STANDER_DATA_DIR}"
else
  DATA_DIR="${PROJECT_ROOT}/${STANDER_DATA_DIR}"
fi

PID_FILE="${STANDER_PID_FILE:-${DATA_DIR}/stander-agent.pid}"
LOG_FILE="${STANDER_LOG_FILE:-${DATA_DIR}/stander-agent.log}"
COMMAND=(node --import tsx src/cli.ts runtime)

mkdir -p "${DATA_DIR}"

usage() {
  cat <<'EOF'
Usage: scripts/run.sh [foreground|start|stop|restart|status|logs]

Commands:
  foreground  Run the unified Web manager and runtime service in the foreground.
  start       Start the service in the background.
  stop        Stop the background service.
  restart     Restart the background service.
  status      Show process and health status.
  logs        Follow the background service log.

Configuration is read from environment variables and an optional project-root .env file.
If STANDER_RUNTIME_TOKEN is missing, interactive start commands prompt for it and save it to .env.
EOF
}

save_env_value() {
  local key="$1"
  local value="$2"
  local escaped_value
  local temp_file
  local found=false

  printf -v escaped_value '%q' "${value}"
  temp_file="${ENV_FILE}.tmp.$$"
  umask 077
  mkdir -p "$(dirname "${ENV_FILE}")"
  : > "${temp_file}"

  if [[ -f "${ENV_FILE}" ]]; then
    while IFS= read -r line || [[ -n "${line}" ]]; do
      if [[ "${line}" == "${key}="* || "${line}" == "export ${key}="* ]]; then
        printf '%s=%s\n' "${key}" "${escaped_value}" >> "${temp_file}"
        found=true
      else
        printf '%s\n' "${line}" >> "${temp_file}"
      fi
    done < "${ENV_FILE}"
  fi

  if [[ "${found}" == false ]]; then
    printf '%s=%s\n' "${key}" "${escaped_value}" >> "${temp_file}"
  fi

  mv "${temp_file}" "${ENV_FILE}"
  chmod 600 "${ENV_FILE}"
}

ensure_runtime_token() {
  if [[ -n "${STANDER_RUNTIME_TOKEN:-}" ]]; then
    return
  fi

  local token
  if ! read -r -s -p "Enter STANDER_RUNTIME_TOKEN: " token </dev/tty; then
    echo "Error: STANDER_RUNTIME_TOKEN is required. Set it in the environment or ${ENV_FILE}." >&2
    exit 1
  fi
  printf '\n' >/dev/tty

  if [[ -z "${token}" ]]; then
    echo "Error: STANDER_RUNTIME_TOKEN cannot be empty." >&2
    exit 1
  fi

  export STANDER_RUNTIME_TOKEN="${token}"
  save_env_value "STANDER_RUNTIME_TOKEN" "${token}"
  echo "STANDER_RUNTIME_TOKEN saved to ${ENV_FILE} with permissions 600."
}

ensure_runtime() {
  if ! command -v node >/dev/null 2>&1; then
    echo "Error: node is not installed or not available on PATH." >&2
    exit 1
  fi

  if [[ ! -d "${PROJECT_ROOT}/node_modules/tsx" ]]; then
    echo "Error: dependencies are not installed. Run 'npm install' first." >&2
    exit 1
  fi

  ensure_runtime_token
}

read_pid() {
  if [[ -f "${PID_FILE}" ]]; then
    tr -d '[:space:]' < "${PID_FILE}"
  fi
}

is_running() {
  local pid
  pid="$(read_pid)"
  [[ -n "${pid}" ]] && kill -0 "${pid}" 2>/dev/null
}

run_foreground() {
  ensure_runtime
  cd "${PROJECT_ROOT}"
  echo "Starting Stander Agent on http://${HOST}:${PORT}"
  exec env HOST="${HOST}" PORT="${PORT}" STANDER_DATA_DIR="${STANDER_DATA_DIR}" "${COMMAND[@]}"
}

start_service() {
  ensure_runtime
  if is_running; then
    echo "Stander Agent is already running (PID $(read_pid))."
    return
  fi

  rm -f "${PID_FILE}"
  cd "${PROJECT_ROOT}"
  nohup env HOST="${HOST}" PORT="${PORT}" STANDER_DATA_DIR="${STANDER_DATA_DIR}" \
    "${COMMAND[@]}" >>"${LOG_FILE}" 2>&1 &
  local pid=$!
  printf '%s\n' "${pid}" > "${PID_FILE}"

  sleep 1
  if kill -0 "${pid}" 2>/dev/null; then
    echo "Stander Agent started (PID ${pid})."
    echo "URL: http://${HOST}:${PORT}"
    echo "Log: ${LOG_FILE}"
    return
  fi

  rm -f "${PID_FILE}"
  echo "Error: Stander Agent failed to start. Check ${LOG_FILE}." >&2
  exit 1
}

stop_service() {
  if ! is_running; then
    rm -f "${PID_FILE}"
    echo "Stander Agent is not running."
    return
  fi

  local pid
  pid="$(read_pid)"
  kill "${pid}"

  for _ in {1..30}; do
    if ! kill -0 "${pid}" 2>/dev/null; then
      rm -f "${PID_FILE}"
      echo "Stander Agent stopped."
      return
    fi
    sleep 1
  done

  echo "Stander Agent did not stop within 30 seconds; sending SIGKILL." >&2
  kill -9 "${pid}" 2>/dev/null || true
  rm -f "${PID_FILE}"
}

show_status() {
  if ! is_running; then
    echo "Stander Agent is not running."
    return 1
  fi

  local pid
  pid="$(read_pid)"
  echo "Stander Agent is running (PID ${pid})."

  if command -v curl >/dev/null 2>&1; then
    local health_host="${HOST}"
    if [[ "${health_host}" == "0.0.0.0" ]]; then
      health_host="127.0.0.1"
    fi
    if curl --fail --silent --show-error "http://${health_host}:${PORT}/health"; then
      echo
    else
      echo "Health check failed." >&2
      return 1
    fi
  fi
}

follow_logs() {
  touch "${LOG_FILE}"
  exec tail -n 100 -f "${LOG_FILE}"
}

case "${1:-foreground}" in
  foreground)
    run_foreground
    ;;
  start)
    start_service
    ;;
  stop)
    stop_service
    ;;
  restart)
    stop_service
    start_service
    ;;
  status)
    show_status
    ;;
  logs)
    follow_logs
    ;;
  -h|--help|help)
    usage
    ;;
  *)
    usage >&2
    exit 2
    ;;
esac
