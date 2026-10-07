# 💰 Finance Manager

Personal finance app: track monthly income, expenses and debts in **Colombian pesos (COP)**.

## Features

- **Monthly summary** — income, expenses and balance, with a breakdown by category. Browse month by month.
- **Transactions** — income and expenses with categories. Amounts in **USD are converted to COP** with the day's exchange rate (editable); the original amount and the rate used are kept for traceability.
- **Debts** — balance, interest rate and minimum payment per debt.

Planned: debts inside the monthly flow, bank-statement PDF import, budgets and charts, payoff strategies (snowball / avalanche).

## Stack

- **Backend:** Node.js, Express, TypeScript, MySQL, Zod
- **Frontend:** React 18, TypeScript, Vite, Tailwind CSS
- **Infra:** Docker Compose (MySQL + API + nginx)

## Run it

```bash
docker compose up --build -d
```

Open http://localhost:5173. Stop with `docker compose down` (data is kept in a Docker volume; `down -v` wipes it).

See [QUICKSTART.md](./QUICKSTART.md) for local development without Docker.

## Project structure

```
finance-manager/
├── backend/     # Express API (routes, models, services, db)
├── frontend/    # React app (pages, components, utils)
└── docker-compose.yml
```

## API

| Endpoint | Description |
|---|---|
| `GET /api/summary?month=YYYY-MM` | Income, expenses, balance and category totals |
| `GET/POST /api/transactions` | List by month / create (`currency: "USD"` is converted to COP) |
| `PUT/DELETE /api/transactions/:id` | Edit / remove |
| `GET /api/categories` | Income and expense categories |
| `GET /api/exchange-rate` | Current USD→COP rate (cached 1 h) |
| `GET/POST/DELETE /api/debts` | Debts |

## Privacy

Bank statements and exports are git-ignored (`uploads/`, `*.pdf`). Never commit personal financial data.

## License

MIT
