#!/bin/bash
echo ""
echo "  ============================================"
echo "   DealDeci Pitch Decimator AI - Installer"
echo "   Copyright 2026 DealDeci LLC"
echo "  ============================================"
echo ""

# Check Docker
if ! command -v docker &> /dev/null; then
    echo "  [ERROR] Docker is not installed."
    echo "  Install from: https://docker.com/products/docker-desktop"
    exit 1
fi

if ! docker info &> /dev/null 2>&1; then
    echo "  [ERROR] Docker is not running. Start Docker Desktop first."
    exit 1
fi

echo "  [OK] Docker is running."
echo ""

# Create .env if missing
if [ ! -f .env ]; then
    cp .env.example .env
    echo -n "  Enter your Anthropic API key (sk-ant-...): "
    read APIKEY
    sed -i.bak "s|sk-ant-xxxxxxxxxxxxxxxxxxxxx|$APIKEY|" .env && rm -f .env.bak
    echo "  [OK] API key saved to .env"
else
    echo "  [OK] .env already exists, skipping."
fi

echo ""
echo "  Building and starting DealDeci..."
echo "  (This may take 2-3 minutes on first run)"
echo ""

docker compose up --build -d

if [ $? -ne 0 ]; then
    echo "  [ERROR] Docker build failed."
    exit 1
fi

echo ""
echo "  ============================================"
echo "   DealDeci is running!"
echo ""
echo "   Open your browser to: http://localhost"
echo ""
echo "   Login:  admin@dealdeci.com"
echo "   Pass:   dealdeci2026"
echo "  ============================================"
echo ""
echo "  To stop:    docker compose down"
echo "  To restart: docker compose up -d"
echo ""
