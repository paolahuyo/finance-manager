# 💰 Finance Manager

Personal finance app: track monthly income, expenses and debts in **Colombian pesos (COP)**.

## Features

- **Monthly summary** — income, expenses and balance, with a breakdown by category. Browse month by month.
- **Transactions** — income and expenses with categories. Amounts in **USD are converted to COP** using the official **TRM of the date you choose** (editable); the original amount and the rate used are kept for traceability.
- **Cards & debts** — each credit card or loan is an account with its balance, annual rate (E.A.) and limit. Record the card used on each expense and the **payments (abonos)** you make. Payments lower the balance but are *not* counted as expenses; **interest and fees are**, so the app shows how much interest each card charged this month and this year.

Planned: import of card statements (Excel and text-based PDF) with a review step, budgets and charts, payoff strategies (snowball / avalanche).

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
| `GET/POST /api/transactions` | List by month / create. `type`: `income`, `expense` or `payment` (needs `account_id`); `currency: "USD"` is converted to COP |
| `PUT/DELETE /api/transactions/:id` | Edit / remove |
| `GET /api/categories` | Income and expense categories |
| `GET /api/exchange-rate?date=YYYY-MM-DD` | Official TRM in force on that day (Superfinanciera open data). Without `date`: market reference rate |
| `GET/POST/PUT/DELETE /api/accounts` | Cards and debts, with balance and interest stats for `?month=` |

## Privacy

Bank statements and exports are git-ignored (`uploads/`, `*.pdf`). Never commit personal financial data.

## License

MIT
