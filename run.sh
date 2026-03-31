#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
#  GreenExtrude — One-click launcher  (Linux / macOS)
#
#  Starts three services in the background, prints their PIDs, and registers a
#  SIGINT / SIGTERM trap so Ctrl+C cleanly shuts everything down.
#
#  Usage:
#    chmod +x run.sh
#    ./run.sh
# ─────────────────────────────────────────────────────────────────────────────

set -e

# ANSI colours
RED='\033[0;31m'
YEL='\033[1;33m'
CYN='\033[0;36m'
GRN='\033[0;32m'
MAG='\033[0;35m'
RST='\033[0m'

# Resolve the directory this script lives in (works with symlinks too)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo ""
echo "  ============================================"
echo -e "   ${GRN}GreenExtrude${RST} | Full Stack Launcher"
echo "  ============================================"
echo ""

# ── Check Node.js ─────────────────────────────────────────────────────────────
if ! command -v node &>/dev/null; then
    echo -e "  ${RED}[ERROR]${RST} Node.js not found. Install from https://nodejs.org/"
    exit 1
fi
NODE_VER=$(node --version)
echo -e "  Node.js detected: ${GRN}${NODE_VER}${RST}"

# ── Install dependencies if needed ───────────────────────────────────────────
echo ""
echo "  Checking dependencies..."
echo "  ─────────────────────────────────────────────"

install_if_needed() {
    local dir="$1"
    local label="$2"
    if [ ! -d "$dir/node_modules" ]; then
        echo -e "  ${YEL}[${label}]${RST} Installing npm packages..."
        (cd "$dir" && npm install --silent)
        echo -e "  ${YEL}[${label}]${RST} Done."
    else
        echo -e "  [${label}] node_modules OK"
    fi
}

install_if_needed "$SCRIPT_DIR/server"    "server   "
install_if_needed "$SCRIPT_DIR/simulator" "simulator"
install_if_needed "$SCRIPT_DIR/client"    "client   "

# ── PID tracking ──────────────────────────────────────────────────────────────
SERVER_PID=""
SIM_PID=""
CLIENT_PID=""

# Cleanup handler — kill all children on Ctrl+C or script exit
cleanup() {
    echo ""
    echo -e "  ${RED}Shutting down all services...${RST}"
    [ -n "$SERVER_PID" ] && kill "$SERVER_PID" 2>/dev/null && echo "  [server]    stopped (PID $SERVER_PID)"
    [ -n "$SIM_PID"    ] && kill "$SIM_PID"    2>/dev/null && echo "  [simulator] stopped (PID $SIM_PID)"
    [ -n "$CLIENT_PID" ] && kill "$CLIENT_PID" 2>/dev/null && echo "  [client]    stopped (PID $CLIENT_PID)"
    echo ""
    exit 0
}

trap cleanup SIGINT SIGTERM

# ── Determine log directory ───────────────────────────────────────────────────
LOG_DIR="$SCRIPT_DIR/.logs"
mkdir -p "$LOG_DIR"

# ── Start Server ──────────────────────────────────────────────────────────────
echo ""
echo -e "  ${CYN}Starting server...${RST}  (logs → .logs/server.log)"
(cd "$SCRIPT_DIR/server" && npm run dev) >"$LOG_DIR/server.log" 2>&1 &
SERVER_PID=$!
echo -e "  [server]    PID ${GRN}${SERVER_PID}${RST}"

# Wait for the server ports to be ready before connecting the simulator
echo "  Waiting for server to bind ports..."
sleep 4

# ── Start Simulator ───────────────────────────────────────────────────────────
echo -e "  ${YEL}Starting simulator...${RST}  (logs → .logs/simulator.log)"
(cd "$SCRIPT_DIR/simulator" && npm run dev) >"$LOG_DIR/simulator.log" 2>&1 &
SIM_PID=$!
echo -e "  [simulator] PID ${GRN}${SIM_PID}${RST}"

sleep 2

# ── Start React Client ────────────────────────────────────────────────────────
echo -e "  ${MAG}Starting React client...${RST}  (logs → .logs/client.log)"
# BROWSER=none prevents CRA from trying to open a browser automatically on some CI envs.
# Remove BROWSER=none if you want the browser to open automatically.
(cd "$SCRIPT_DIR/client" && BROWSER=none npm start) >"$LOG_DIR/client.log" 2>&1 &
CLIENT_PID=$!
echo -e "  [client]    PID ${GRN}${CLIENT_PID}${RST}"

# ── Summary ───────────────────────────────────────────────────────────────────
echo ""
echo "  ============================================"
echo -e "   ${GRN}All services running!${RST}"
echo "  ============================================"
echo ""
echo -e "   Client UI   →  ${CYN}http://localhost:3000${RST}"
echo -e "   REST API     →  ${CYN}http://localhost:3001${RST}"
echo -e "   WebSocket    →  ${CYN}ws://localhost:3002${RST}"
echo -e "   MQTT broker  →  ${CYN}mqtt://localhost:1883${RST}"
echo ""
echo "   Logs are written to: .logs/"
echo "     tail -f .logs/server.log"
echo "     tail -f .logs/simulator.log"
echo "     tail -f .logs/client.log"
echo ""
echo -e "  ${RED}Press Ctrl+C to stop all services.${RST}"
echo ""

# ── Open browser (macOS / Linux best-effort) ─────────────────────────────────
sleep 5
if command -v xdg-open &>/dev/null; then
    xdg-open "http://localhost:3000" &>/dev/null &
elif command -v open &>/dev/null; then
    open "http://localhost:3000" &>/dev/null &
fi

# ── Keep script alive until Ctrl+C ───────────────────────────────────────────
wait
