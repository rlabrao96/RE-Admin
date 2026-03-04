#!/bin/bash
# ─────────────────────────────────────────────────────────────────────────────
# start_dev.sh — Dev server launcher for Edificios App
#
# Usage:
#   ./start_dev.sh           → Start backend + frontend
#   ./start_dev.sh --ngrok   → Start backend + frontend + ngrok (for Fintoc webhooks)
#   ./start_dev.sh --reset   → Kill all processes and exit (clean slate)
# ─────────────────────────────────────────────────────────────────────────────

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
USE_NGROK=false

# Parse flags
for arg in "$@"; do
  case $arg in
    --ngrok) USE_NGROK=true ;;
    --reset)
      echo "Resetting — killing all dev processes..."
      lsof -ti:3000 | xargs kill -9 2>/dev/null && echo "  ✓ Port 3000 cleared" || echo "  - Port 3000 was free"
      lsof -ti:8000 | xargs kill -9 2>/dev/null && echo "  ✓ Port 8000 cleared" || echo "  - Port 8000 was free"
      lsof -ti:4040 | xargs kill -9 2>/dev/null && echo "  ✓ Port 4040 cleared (ngrok)" || echo "  - Port 4040 was free"
      echo "Done."
      exit 0
      ;;
  esac
done

# ── Kill any existing processes on dev ports ──────────────────────────────────
echo ""
echo "Clearing ports..."
lsof -ti:3000 | xargs kill -9 2>/dev/null
lsof -ti:8000 | xargs kill -9 2>/dev/null
lsof -ti:4040 | xargs kill -9 2>/dev/null
sleep 1

# ── Start Backend ─────────────────────────────────────────────────────────────
echo "Starting backend (FastAPI)..."
cd "$SCRIPT_DIR/backend"
if [ -f .env ]; then
  set -a; source .env; set +a
fi
./.venv/bin/python -m uvicorn app.main:app --reload --port 8000 > /tmp/edificios_backend.log 2>&1 &
BACKEND_PID=$!

# ── Start Frontend ────────────────────────────────────────────────────────────
echo "Starting frontend (Next.js)..."
cd "$SCRIPT_DIR/frontend"
npx next dev --port 3000 > /tmp/edificios_frontend.log 2>&1 &
FRONTEND_PID=$!
cd "$SCRIPT_DIR"

# ── Optional: ngrok ───────────────────────────────────────────────────────────
NGROK_URL=""
if [ "$USE_NGROK" = true ]; then
  if ! command -v ngrok &> /dev/null; then
    echo ""
    echo "  ERROR: ngrok not found. Install it from https://ngrok.com/download"
    echo "  Running without ngrok."
  else
    echo "Starting ngrok on port 8000..."
    ngrok http 8000 > /tmp/edificios_ngrok.log 2>&1 &
    NGROK_PID=$!

    # Wait for ngrok to be ready (up to 8 seconds)
    for i in {1..8}; do
      sleep 1
      NGROK_URL=$(curl -s http://localhost:4040/api/tunnels 2>/dev/null | \
        python3 -c "import sys,json; tunnels=json.load(sys.stdin).get('tunnels',[]); \
        https=[t['public_url'] for t in tunnels if t['public_url'].startswith('https')]; \
        print(https[0] if https else '')" 2>/dev/null)
      if [ -n "$NGROK_URL" ]; then
        break
      fi
    done

    if [ -n "$NGROK_URL" ]; then
      # Update backend/.env
      if grep -q "BACKEND_PUBLIC_URL" "$SCRIPT_DIR/backend/.env"; then
        sed -i '' "s|BACKEND_PUBLIC_URL=.*|BACKEND_PUBLIC_URL=$NGROK_URL|" "$SCRIPT_DIR/backend/.env"
      else
        echo "BACKEND_PUBLIC_URL=$NGROK_URL" >> "$SCRIPT_DIR/backend/.env"
      fi

      # Update frontend/.env.local
      if grep -q "NEXT_PUBLIC_WEBHOOK_BASE_URL" "$SCRIPT_DIR/frontend/.env.local"; then
        sed -i '' "s|NEXT_PUBLIC_WEBHOOK_BASE_URL=.*|NEXT_PUBLIC_WEBHOOK_BASE_URL=$NGROK_URL|" "$SCRIPT_DIR/frontend/.env.local"
      else
        echo "NEXT_PUBLIC_WEBHOOK_BASE_URL=$NGROK_URL" >> "$SCRIPT_DIR/frontend/.env.local"
      fi
    fi
  fi
fi

# ── Trap Ctrl+C to clean up all processes ────────────────────────────────────
cleanup() {
  echo ""
  echo "Shutting down..."
  kill $BACKEND_PID $FRONTEND_PID 2>/dev/null
  [ -n "$NGROK_PID" ] && kill $NGROK_PID 2>/dev/null
  exit 0
}
trap cleanup SIGINT SIGTERM

# ── Print status ──────────────────────────────────────────────────────────────
sleep 2
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Edificios Dev Server"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Frontend  →  http://localhost:3000"
echo "  Backend   →  http://localhost:8000"
echo "  API Docs  →  http://localhost:8000/docs"
if [ -n "$NGROK_URL" ]; then
  echo "  ngrok     →  $NGROK_URL"
  echo ""
  echo "  Fintoc webhook URL:"
  echo "  $NGROK_URL/api/fintoc/webhook/link-token/{building_id}"
elif [ "$USE_NGROK" = true ]; then
  echo "  ngrok     →  (failed to get URL — check /tmp/edificios_ngrok.log)"
fi
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "  Logs:"
echo "    Backend  → tail -f /tmp/edificios_backend.log"
echo "    Frontend → tail -f /tmp/edificios_frontend.log"
echo ""
echo "  Press Ctrl+C to stop all servers."
echo ""

wait
