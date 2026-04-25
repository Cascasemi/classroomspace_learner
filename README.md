# OpenClass Learner

OpenClass Learner is an Agentic AI powered classroom generation platform built for **Blackathon by BlackWPT**.  
It lets a learner create a classroom from a custom topic, then experience an interactive lesson flow with multi-agent instruction, whiteboard support, quizzes, and progress-aware playback.

## Why This Project

Most learners can ask questions, but struggle to get a complete, structured lesson experience tailored to their level.  
OpenClass Learner turns a single topic prompt into a full classroom session with generated scenes, guided narration, interactive moments, and adaptive pacing.

## Core Features

- Topic-based classroom generation (`/api/classroom/custom`)
- Classroom session lifecycle: generating -> ready -> in-class runtime
- Interactive classroom player with:
  - agent-led narration
  - whiteboard rendering/actions
  - discussion/Q&A flows
  - quiz checkpoints
- Classroom history list on dashboard:
  - view all generated classrooms
  - open any previous classroom
  - delete classroom sessions
- Authentication + onboarding flow

## Current User Flow

1. Landing page (`/`)
2. Create account or login (`/register`, `/login`)
3. Onboarding (`/onboarding`)
4. Dashboard (`/dashboard`) - direct classroom creation + classroom list
5. Enter created classroom (`/classroom/:id`)

## Tech Stack

### Frontend
- React + TypeScript + Vite
- Tailwind CSS + Radix UI components
- React Router

### Backend
- Node.js + Express + TypeScript
- MongoDB + Mongoose
- Zod validation

## Monorepo Layout

```text
openclass_learner/
  src/                    # frontend app
  server/
    src/                  # backend API
  .env                    # root env (shared project copy)
  server/.env             # backend runtime env
```

## Prerequisites

- Node.js 20+ (Node 22 recommended)
- npm 9+
- MongoDB Atlas URI (or local MongoDB)

## Environment Configuration

This project expects:

- Frontend API base in `.env.local`
- Backend secrets/config in `server/.env`

### 1) Frontend `.env.local`

Create `openclass_learner/.env.local`:

```env
VITE_API_URL=http://localhost:5000/api
```

### 2) Backend `server/.env`

Create or update `openclass_learner/server/.env`:

```env
MONGODB_URI=your_mongodb_connection_string
JWT_SECRET=your_jwt_secret
JWT_EXPIRES_IN=7d
PORT=5000
NODE_ENV=development
CLIENT_URL=http://localhost:8080
```

You can keep your existing model-provider keys (Gemini/OpenAI/etc.) in this same file.

## Run Locally

Open two terminals.

### Terminal A - Backend

```bash
cd server
npm install
npm run dev
```

Backend runs on: `http://localhost:5000`

### Terminal B - Frontend

```bash
npm install
npm run dev
```

Frontend runs on: `http://localhost:8080`

## Production Build

### Frontend

```bash
npm run build
```

### Backend

```bash
cd server
npm run build
```

## Troubleshooting

### Dependency corruption (example: lodash/recharts resolution errors)

If you see errors like `Could not resolve "lodash/isNil"`:

```bash
rm -rf node_modules package-lock.json
npm install
```

On Windows PowerShell:

```powershell
Remove-Item node_modules -Recurse -Force
Remove-Item package-lock.json -Force
npm install
```

Then restart dev server.

### CORS issues

Ensure:
- frontend URL matches backend `CLIENT_URL`
- frontend uses `VITE_API_URL=http://localhost:5000/api`

## API (Classroom-Critical Endpoints)

- `POST /api/classroom/custom` - create classroom from topic
- `GET /api/classroom` - list classrooms for current user
- `GET /api/classroom/:id` - fetch classroom detail/runtime state
- `PUT /api/classroom/:id/progress` - update classroom progress
- `POST /api/classroom/:id/quiz` - submit quiz answers
- `DELETE /api/classroom/:id` - delete classroom

## Hackathon Note

This repository is optimized around a single strong user journey for judging:
**create account -> onboarding -> create classroom -> learn inside generated classroom**.

## Team

Built for **Blackathon by BlackWPT**.

