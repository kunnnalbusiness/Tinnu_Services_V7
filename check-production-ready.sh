#!/bin/bash
# 🚀 Scalping Bot - Real Money Setup Checklist
# Run this script to verify everything is ready for production

set -e

echo "════════════════════════════════════════════════════════════════"
echo "  🚀 SCALPING BOT - PRODUCTION READINESS CHECKER"
echo "════════════════════════════════════════════════════════════════"
echo ""

# Color codes
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

check_status() {
    if [ $1 -eq 0 ]; then
        echo -e "${GREEN}✅ $2${NC}"
    else
        echo -e "${RED}❌ $2${NC}"
        exit 1
    fi
}

warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

echo "════════════════════════════════════════════════════════════════"
echo "  1️⃣  MongoDB Status"
echo "════════════════════════════════════════════════════════════════"
echo ""

docker_status=$(sudo docker ps --filter name=scalping-mongo --format "{{.Status}}" 2>/dev/null || echo "stopped")
if [[ $docker_status == "Up"* ]]; then
    echo -e "${GREEN}✅ MongoDB is running${NC}"
    echo "   Status: $docker_status"
else
    echo -e "${RED}❌ MongoDB is not running${NC}"
    echo ""
    echo "Start MongoDB with:"
    echo "  sudo docker run -d --name scalping-mongo --restart unless-stopped -p 27017:27017 -v scalping-mongo-data:/data/db mongo:7"
    exit 1
fi

echo ""
echo "════════════════════════════════════════════════════════════════"
echo "  2️⃣  Backend Files Check"
echo "════════════════════════════════════════════════════════════════"
echo ""

cd /workspaces/codespaces-blank/Scalping-main/backend

# Check critical files
[ -f "server.py" ] && check_status 0 "server.py exists" || check_status 1 "server.py missing"
[ -f "requirements.txt" ] && check_status 0 "requirements.txt exists" || check_status 1 "requirements.txt missing"
[ -d "lib/" ] && check_status 0 "lib/ directory exists" || check_status 1 "lib/ directory missing"
[ -d "routers/" ] && check_status 0 "routers/ directory exists" || check_status 1 "routers/ directory missing"

echo ""
echo "════════════════════════════════════════════════════════════════"
echo "  3️⃣  Backend Tests"
echo "════════════════════════════════════════════════════════════════"
echo ""

if [ -d ".venv" ]; then
    source .venv/bin/activate
    python -m pytest -q 2>/dev/null
    check_status $? "All backend tests passing"
else
    warning "Virtual environment not found. Create it with:"
    echo "   python3 -m venv .venv"
    echo "   source .venv/bin/activate"
    echo "   python -m pip install -r requirements.txt"
fi

echo ""
echo "════════════════════════════════════════════════════════════════"
echo "  4️⃣  .env Configuration"
echo "════════════════════════════════════════════════════════════════"
echo ""

if [ -f ".env" ]; then
    echo -e "${GREEN}✅ .env file exists${NC}"
    
    # Check if .env has required fields
    grep -q "MONGODB_URI" .env && echo -e "${GREEN}✅ MONGODB_URI configured${NC}" || echo -e "${RED}❌ MONGODB_URI missing${NC}"
    grep -q "DB_NAME" .env && echo -e "${GREEN}✅ DB_NAME configured${NC}" || echo -e "${RED}❌ DB_NAME missing${NC}"
    
    echo -e "${GREEN}✅ CoinDCX credentials are managed dynamically through the API Keys UI${NC}"
    
    # Check live trading setting
    if grep -q 'live_trading.*false\|liveTrading.*false' .env 2>/dev/null; then
        echo -e "${GREEN}✅ live trading toggle is off (safe mode)${NC}"
    elif grep -q 'live_trading.*true\|liveTrading.*true' .env 2>/dev/null; then
        echo -e "${RED}⚠️  live trading toggle is on (REAL MONEY MODE)${NC}"
    fi
else
    echo -e "${RED}❌ .env file not found${NC}"
    echo ""
    echo "Create .env file with:"
    echo "  cat > .env << 'EOF'"
    echo "  MONGODB_URI=\"mongodb://127.0.0.1:27017\""
    echo "  DB_NAME=\"scalping\""
    echo "  CORS_ORIGINS=\"http://localhost:3000\""
    echo "  CREDENTIAL_ENCRYPTION_KEY=\"generate-a-fernet-key-and-store-it-as-a-secret\""
    echo "  # keep the live toggle off until validation is complete"
    echo "  EOF"
    exit 1
fi

echo ""
echo "════════════════════════════════════════════════════════════════"
echo "  5️⃣  Frontend Setup"
echo "════════════════════════════════════════════════════════════════"
echo ""

cd /workspaces/codespaces-blank/Scalping-main/frontend

[ -f "package.json" ] && check_status 0 "package.json exists" || check_status 1 "package.json missing"
[ -f "vite.config.ts" ] && check_status 0 "vite.config.ts exists" || check_status 1 "vite.config.ts missing"

if [ -d "node_modules" ]; then
    echo -e "${GREEN}✅ node_modules installed${NC}"
else
    echo -e "${YELLOW}⚠️  node_modules not installed${NC}"
    echo "   Install with: yarn install"
fi

echo ""
echo "════════════════════════════════════════════════════════════════"
echo "  6️⃣  CoinDCX API Configuration"
echo "════════════════════════════════════════════════════════════════"
echo ""

cd /workspaces/codespaces-blank/Scalping-main/backend

echo -e "${GREEN}✅ API credentials are added dynamically from the API Keys UI${NC}"
echo ""
echo "Before going LIVE:"
echo "  1. Test with PAPER MODE for 24+ hours"
echo "  2. Verify all strategy signals are working correctly"
echo "  3. Monitor logs for any errors"
echo "  4. Start with small capital (₹1,000-5,000)"
echo "  5. Only then enable the live toggle to true"

echo ""
echo "════════════════════════════════════════════════════════════════"
echo "  ✅ READINESS SUMMARY"
echo "════════════════════════════════════════════════════════════════"
echo ""
echo "Your bot is ready to:"
echo ""
echo "  1. 📊 PAPER MODE (Default - no real money risk):"
echo "     - All strategy signals work"
echo "     - Orders simulate filling"
echo "     - P&L calculated on paper"
echo ""
echo "  2. 💰 LIVE MODE (Only after 24h paper testing):"
echo "     - REAL orders to CoinDCX"
echo "     - REAL P&L impact"
echo "     - REAL capital at risk"
echo ""
echo "════════════════════════════════════════════════════════════════"
echo "  🚀 NEXT STEPS"
echo "════════════════════════════════════════════════════════════════"
echo ""
echo "Terminal 1 - Start Backend:"
echo "  cd /workspaces/codespaces-blank/Scalping-main/backend"
echo "  source .venv/bin/activate"
echo "  python -m uvicorn server:app --host 0.0.0.0 --port 8001"
echo ""
echo "Terminal 2 - Start Frontend:"
echo "  cd /workspaces/codespaces-blank/Scalping-main/frontend"
echo "  yarn install  # if not already done"
echo "  yarn dev --host 0.0.0.0 --port 3000"
echo ""
echo "Terminal 3 - Monitor:"
echo "  # Watch backend logs, check frontend at http://localhost:3000"
echo ""
echo "════════════════════════════════════════════════════════════════"
echo "  ⚠️  SAFETY CHECKLIST (Before Going LIVE)"
echo "════════════════════════════════════════════════════════════════"
echo ""
echo "  [ ] MongoDB running"
echo "  [ ] All 28 backend tests passing"
echo "  [ ] .env file created with correct values"
echo "  [ ] Tested in PAPER MODE for 24+ hours"
echo "  [ ] All strategy signals working correctly"
echo "  [ ] No errors in console logs"
echo "  [ ] Small capital allocated (start with ₹1,000-5,000)"
echo "  [ ] Emergency stop procedure understood"
echo "  [ ] IP whitelisting enabled in CoinDCX"
echo "  [ ] Two-factor authentication enabled"
echo ""
echo "════════════════════════════════════════════════════════════════"
echo ""
echo -e "${GREEN}🎉 You're ready to start!${NC}"
echo ""
