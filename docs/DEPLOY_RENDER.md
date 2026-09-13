# Render Deployment

This repository is prepared as one Render Docker web service. The image builds the
Vite frontend and serves it from FastAPI, so REST calls and WebSockets remain same-origin.

## Deploy

1. Push the repository to a **private** GitHub repository.
2. In Render, choose **New + > Blueprint** and select the repository.
3. Render reads `render.yaml` and builds the root `Dockerfile`.
4. Set the required `sync: false` values in Render:
   - `MONGODB_URI`: MongoDB Atlas connection string
   - `APP_URL`: final Render URL
   - Add CoinDCX API credentials after login through the API Keys UI; they are encrypted per user in MongoDB.
   - `ADMIN_PASSWORD`: use a strong deployment-only password
5. Keep the live-trading toggle off (`false`) during deployment and paper testing.
6. Open the deployed URL, log in, add CoinDCX credentials through API Keys, validate,
   and enable live trading only after checking the account and strategy settings.

## Local files

Keep `backend/.env` local. It is ignored by `.gitignore` and is not copied into the
Docker image by `.dockerignore`. Use `backend/.env.example` as the variable reference.

The Docker image builds `frontend/` first, copies its `dist/` output into the
backend image, and runs one Uvicorn worker because the market and bot loops are
in-process.

## Runtime

Render supplies `PORT`; the Docker command binds FastAPI to `0.0.0.0` with one worker.
One worker is required because the scheduler runs inside the process.