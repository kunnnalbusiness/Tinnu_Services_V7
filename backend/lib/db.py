"""MongoDB connection shared across the backend."""

from __future__ import annotations

import os
from pathlib import Path
from typing import Any

from dotenv import load_dotenv
from motor.motor_asyncio import AsyncIOMotorClient, AsyncIOMotorDatabase

load_dotenv(Path(__file__).resolve().parents[1] / ".env")

MONGODB_URI = os.getenv("MONGODB_URI")
DB_NAME = os.getenv("DB_NAME")

if not MONGODB_URI:
    raise RuntimeError("MONGODB_URI is not set in backend/.env")
if not DB_NAME:
    raise RuntimeError("DB_NAME is not set in backend/.env")

client: AsyncIOMotorClient[Any] = AsyncIOMotorClient(
    MONGODB_URI,
    serverSelectionTimeoutMS=10000,
    connectTimeoutMS=10000,
    socketTimeoutMS=30000,
)

db: AsyncIOMotorDatabase[Any] = client[DB_NAME]
