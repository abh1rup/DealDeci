# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**DealDeci Pitch Decimator AI** — a full-stack web application that stress-tests startup pitch decks by running 12 AI investor persona agents in parallel. Users upload a deck, all agents analyze simultaneously, and the app generates scored reports with vulnerabilities, adversarial Q&A, and AI-powered pitch enhancement. Enhanced pitches are saved locally in the `output/` folder.

**DealDeci LLC** holds all copyright and confidentiality.

## Architecture

```
backend/server.js        — Express server (auth, file parsing, Anthropic API, local save)
frontend/index.html      — Single-page app
frontend/css/style.css   — Design system (navy/coral/ice, Bebas Neue + DM Sans)
frontend/js/app.js       — Client-side logic (upload, results, settings, sidebar)
output/                  — Generated enhanced pitch files (HTML + TXT)
.env                     — API keys and admin credentials (never commit)
Dockerfile / docker-compose.yml — Container deployment
```

### Backend (Node.js/Express)
- **POST /api/auth/login** — Local admin auth (username/password from `.env`)
- **POST /api/analyze** — Multipart upload (PDF, PPTX, DOCX, TXT), runs enabled persona agents via `Promise.allSettled` in parallel
- **POST /api/enhance** — Generates improved pitch from combined persona feedback
- **POST /api/save** — Saves enhanced pitch as HTML + TXT to `output/` folder
- **GET /api/files** — Lists saved files from `output/`
- **GET /api/download** — Direct download of enhanced pitch (HTML or TXT)
- File parsing: `pdf-parse` (PDF as base64 for Claude), `mammoth` (DOCX), custom zip/XML parser (PPTX)
- Anthropic API key in `.env`, never exposed to frontend

### Frontend
- Two-step flow: (1) upload deck + optional context, (2) launch all agents
- Tabbed persona results with scorecard, vulnerabilities, Q&A
- Pitch enhancement with download (HTML/TXT) and local save
- Settings modal: model selection, persona toggles, depth, strictness, auto-enhance
- Sidebar: session history, stats, saved files, active agents list
- Mobile responsive

### 12 Investor Personas
Silicon Valley VC, Southeast Angel, University Judge, Traditional Businessman, Impact Investor, Serial Founder, Corporate VC, PE/Growth Equity, Deep Tech Investor, Family Office, Emerging Markets VC, Fintech Specialist

## Development

```bash
cd backend && npm install
cp ../.env.example ../.env   # Fill in API key and admin creds
npm run dev                  # http://localhost:3000 with --watch

# Docker
docker compose up --build    # http://localhost:3000
```

## Auth

Local admin login. Credentials set in `.env`:
- `ADMIN_USER` — default: `admin@dealdeci.com`
- `ADMIN_PASS` — default: `dealdeci2026`
