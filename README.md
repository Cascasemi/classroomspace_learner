# OpenClass Learner

**OpenClass Learner** is an **Agentic AI-powered classroom generation platform** built for **Blackathon by BlackWPT**.  

It transforms a single topic into a **fully structured, interactive learning experience**, where multiple AI agents collaborate to simulate a real classroom environment.

---

## 🧠 What Makes This Different

Most AI learning tools act like chatbots — they answer questions.

OpenClass Learner behaves like a **teaching system**.

It uses a **multi-agent architecture** where each AI agent has a specialized teaching role. Together, they generate and deliver a complete lesson experience with structure, flow, and interactivity.

---

## 🤖 The Agent System (Core Value Proposition)

Instead of one model doing everything, OpenClass Learner uses **coordinated agents**, each responsible for a different part of the classroom experience:

### 🎓 1. Lesson Architect Agent
- Breaks down the topic into a structured curriculum
- Defines lesson flow: introduction → explanation → examples → assessment
- Ensures content is pedagogically sound

---

### 🧑‍🏫 2. Instructor Agent
- Delivers the lesson in a human-like teaching style
- Explains concepts step-by-step
- Adjusts tone and pacing based on difficulty

---

### 🧩 3. Whiteboard / Visualization Agent
- Converts explanations into visual representations
- Draws diagrams, steps, and structured breakdowns
- Makes abstract concepts easier to understand

---

### 💬 4. Interaction Agent
- Handles questions from the learner
- Simulates classroom discussions
- Provides clarifications and alternative explanations

---

### 📝 5. Assessment Agent
- Generates quizzes and checkpoints
- Evaluates learner understanding in real time
- Provides feedback and reinforcement learning

---

### 🔄 How They Work Together

These agents operate as a **coordinated system**, not independently:

1. Lesson Architect designs the learning path  
2. Instructor delivers the content  
3. Visualization Agent enhances understanding  
4. Interaction Agent responds to learner input  
5. Assessment Agent evaluates progress  

👉 The result is a **complete classroom simulation powered by AI collaboration**, not a single response model.

---

## 🚀 Key Features

### 📚 AI Classroom Generation
- Generate full interactive classrooms from a single topic  
- Endpoint: `/api/classroom/custom`

---

### 🎮 Interactive Learning Experience
- Agent-led teaching sessions  
- Whiteboard-based explanations  
- Real-time Q&A simulation  
- Embedded quizzes and checkpoints  

---

### 📊 Adaptive Learning Flow
- Tracks learner progress through sessions  
- Allows pause and resume  
- Adjusts pacing based on interaction  

---

### 🗂️ Classroom Management
- View all generated classrooms  
- Reopen past learning sessions  
- Delete or manage sessions  

---

### 🔐 Authentication System
- User accounts  
- Onboarding flow  
- Personalized classroom history  

---

## 🔄 User Flow

1. Landing Page → `/`  
2. Register / Login → `/register`, `/login`  
3. Onboarding → `/onboarding`  
4. Dashboard → `/dashboard`  
   - Create new classroom  
   - View past classrooms  
5. Classroom Session → `/classroom/:id`  

---

## 🏗️ Tech Stack

### Frontend
- React + TypeScript + Vite  
- Tailwind CSS + Radix UI  
- React Router  

### Backend
- Node.js + Express + TypeScript  
- MongoDB + Mongoose  
- Zod validation  

---

## 📁 Monorepo Structure

```
openclass_learner/
  src/                    # Frontend app
  server/
    src/                  # Backend API
  .env
  server/.env
```

---

## ⚙️ Setup Instructions

### Requirements
- Node.js 20+  
- npm 9+  
- MongoDB Atlas or local MongoDB  

---

### Frontend Environment (`.env.local`)

```
VITE_API_URL=http://localhost:5000/api
```

---

### Backend Environment (`server/.env`)

```
MONGODB_URI=your_mongodb_uri
JWT_SECRET=your_jwt_secret
JWT_EXPIRES_IN=7d
PORT=5000
NODE_ENV=development
CLIENT_URL=http://localhost:8080
```

---

## ▶️ Running Locally

### Backend

```bash
cd server
npm install
npm run dev
```

### Frontend

```bash
npm install
npm run dev
```

---

## 🚨 Troubleshooting

### Dependency Issues

```bash
rm -rf node_modules package-lock.json
npm install
```

Windows:

```powershell
Remove-Item node_modules -Recurse -Force
Remove-Item package-lock.json -Force
npm install
```

---

### CORS Issues
Ensure:
- `VITE_API_URL` matches backend URL  
- `CLIENT_URL=http://localhost:8080`

---

## 🧪 API Endpoints

- `POST /api/classroom/custom` → Generate classroom from topic  
- `GET /api/classroom` → Get user classrooms  
- `GET /api/classroom/:id` → Load classroom session  
- `PUT /api/classroom/:id/progress` → Update progress  
- `POST /api/classroom/:id/quiz` → Submit answers  
- `DELETE /api/classroom/:id` → Delete classroom  

---

## 🏁 Hackathon Focus

This project is optimized around a single high-impact flow:

> **User enters a topic → AI agents build a classroom → user learns interactively**

---

## 👥 Built For

**Blackathon by BlackWPT**

