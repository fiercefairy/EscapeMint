#!/bin/bash

# EscapeMint Setup Script
# Checks dependencies and sets up the development environment

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

print_status() {
    echo -e "${GREEN}[OK]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

print_step() {
    echo -e "\n${GREEN}==>${NC} $1"
}

# Check if Node.js is installed and version is 20+
check_node() {
    print_step "Checking Node.js..."

    if ! command -v node &> /dev/null; then
        print_error "Node.js is not installed"
        echo ""
        echo "Please install Node.js 20 or higher:"
        echo "  - macOS: brew install node"
        echo "  - Or download from: https://nodejs.org/"
        echo ""
        exit 1
    fi

    NODE_VERSION=$(node -v | sed 's/v//' | cut -d. -f1)

    if [ "$NODE_VERSION" -lt 20 ]; then
        print_error "Node.js version 20+ required (found v$(node -v | sed 's/v//'))"
        echo ""
        echo "Please upgrade Node.js:"
        echo "  - macOS: brew upgrade node"
        echo "  - Or download from: https://nodejs.org/"
        echo ""
        exit 1
    fi

    print_status "Node.js $(node -v) found"
}

# Check if npm is available
check_npm() {
    print_step "Checking npm..."

    if ! command -v npm &> /dev/null; then
        print_error "npm is not installed (should come with Node.js)"
        exit 1
    fi

    print_status "npm $(npm -v) found"
}

# Install dependencies
install_deps() {
    print_step "Installing dependencies..."
    npm install
    print_status "Dependencies installed"
}

# Build packages
build_packages() {
    print_step "Building packages..."
    npm run build:packages
    print_status "Packages built"
}

# Setup data directory
setup_data() {
    print_step "Setting up data directory..."
    mkdir -p data/funds
    print_status "Data directory created at ./data/funds/"
}

# Install PM2 globally if not present
check_pm2() {
    print_step "Checking PM2..."

    if ! command -v pm2 &> /dev/null; then
        print_warning "PM2 not found globally, installing..."
        npm install -g pm2
    fi

    print_status "PM2 $(pm2 -v) found"
}

# Start development servers
start_servers() {
    print_step "Starting development servers..."
    npm run dev
}

# Main setup flow
main() {
    echo ""
    echo "================================"
    echo "  EscapeMint Setup"
    echo "================================"

    check_node
    check_npm
    check_pm2
    install_deps
    build_packages
    setup_data

    echo ""
    echo "================================"
    echo -e "  ${GREEN}Setup complete!${NC}"
    echo "================================"
    echo ""
    echo "Starting the application..."
    echo ""
    echo "  Frontend: http://localhost:5550"
    echo "  API:      http://localhost:5551"
    echo ""
    echo "Press Ctrl+C to exit logs (servers keep running)"
    echo "Use 'npm run dev:stop' to stop servers"
    echo ""

    start_servers
}

main
