# Inventory & Order Management System

Production-ready technical assessment project with a React frontend, FastAPI backend, PostgreSQL persistence, and Docker Compose orchestration.

## Features

- Product management: create, list, view, update, delete
- Customer management: create, list, view, delete
- Order management: create, list, view details, delete/cancel
- Dashboard: total products, customers, orders, and low-stock products
- Business rules: unique SKUs, unique emails, non-negative stock, insufficient-stock prevention, automatic inventory reduction, backend-calculated order totals

## Tech Stack

- Frontend: React, Vite, JavaScript
- Backend: Python, FastAPI, SQLAlchemy
- Database: PostgreSQL
- Containers: Docker, Docker Compose

## Local Docker Run

```bash
cp .env.example .env
docker compose up --build
```

Open:

- Frontend: http://localhost:8080
- Backend API: http://localhost:8000
- API docs: http://localhost:8000/docs

PostgreSQL data is persisted in the named Docker volume `postgres_data`.

## Local Development Without Docker

Backend:

```bash
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
export DATABASE_URL="postgresql+psycopg://inventory:inventory@localhost:5432/inventory_db"
uvicorn app.main:app --reload
```

Frontend:

```bash
cd frontend
npm install
cp .env.example .env
npm run dev
```

## API Endpoints

Products:

- `POST /products`
- `GET /products`
- `GET /products/{id}`
- `PUT /products/{id}`
- `DELETE /products/{id}`

Customers:

- `POST /customers`
- `GET /customers`
- `GET /customers/{id}`
- `DELETE /customers/{id}`

Orders:

- `POST /orders`
- `GET /orders`
- `GET /orders/{id}`
- `DELETE /orders/{id}`

Dashboard:

- `GET /dashboard`

## Deployment

Backend options:

- Render: use `render.yaml`, then set `CORS_ORIGINS` to the deployed frontend URL.
- Railway/Fly.io: deploy `backend/Dockerfile` and set `DATABASE_URL`, `CORS_ORIGINS`, and `LOW_STOCK_THRESHOLD`.

Frontend options:

- Netlify: use `netlify.toml`, set `VITE_API_URL` to the deployed backend URL.
- Vercel: use `vercel.json`, set `VITE_API_URL` to the deployed backend URL.

Docker Hub backend image:

```bash
docker build -t <dockerhub-user>/inventory-api:latest ./backend
docker push <dockerhub-user>/inventory-api:latest
```

## Submission Checklist

- GitHub repository link
- Docker Hub image link for the backend image
- Live frontend deployment URL
- Live backend API URL
