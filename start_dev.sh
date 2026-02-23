#!/bin/bash

echo "Killing existing processes on ports 3000 and 8000..."
lsof -ti:3000 | xargs kill -9 2>/dev/null
lsof -ti:8000 | xargs kill -9 2>/dev/null

echo "Starting Backend API..."
cd backend
source .venv/bin/activate
# Load env from .env file — copy .env.example to .env and fill in your keys
if [ -f .env ]; then
  export $(grep -v '^#' .env | xargs)
fi
uvicorn app.main:app --reload &
BACKEND_PID=$!
cd ..

echo "Starting Frontend App..."
cd frontend
npm run dev &
FRONTEND_PID=$!
cd ..

echo "Both applications are starting!"
echo "Backend PID: $BACKEND_PID"
echo "Frontend PID: $FRONTEND_PID"

wait
