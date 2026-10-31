# CLAUDE.md — guía para trabajar en este repo

App de finanzas personales en **pesos colombianos (COP)**: ingresos, gastos, tarjetas de crédito, préstamos
(libranzas), importación de extractos bancarios y planeación de pagos. Una sola persona la usa, en local.

## Reglas de privacidad (no negociables)

- **Nunca** subas a git nada de `uploads/` (extractos, recibos, Excel, textos enmascarados). Ya está en
  `.gitignore` junto con `*.pdf`; no lo quites.
- **Nunca** pongas datos reales de la usuaria en código, pruebas, fixtures, documentación, commits ni PRs:
  nombres, cédulas, números de tarjeta o cuenta, salario, saldos, comercios reales asociados a ella.
  Las pruebas usan **datos inventados** que solo imitan la estructura de los documentos reales.
- El repo es **público**.

## Stack y estructura

- **Backend** (`backend/`): Node 24, Express, TypeScript estricto (CommonJS), MySQL 8 (`mysql2/promise`),
  validación con **zod**, PDFs con `pdfjs-dist`, Excel con `exceljs`.
  - `src/index.ts` — registra las rutas bajo `/api/*`.
  - `src/db/init.ts` — crea tablas y aplica **migraciones idempotentes** al arrancar (consulta
    `information_schema` antes de cada `ALTER`). Sigue ese patrón para cualquier cambio de esquema.
  - `src/models/` — acceso a datos (SQL a mano, sin ORM). `src/routes/` — endpoints. `src/services/` —
    lógica pura o con BD (`linkPayments.ts` es pura y probada; `paymentLinker.ts` la usa con la BD;
    `directedPayments.ts` + `directedPaymentLinker.ts` ligan abonos dirigidos recientes a su compra;
    `subscriptions.ts` detecta cobros mensuales; `paymentPlan.ts` genera el plan de pagos).
  - `src/importers/` — lectores de extractos: `bbva.ts`, `nu.ts`, `bogota.ts` (PDF), `excel.ts` (Excel BBVA),
    `loanPlan.ts` (plan de pagos de libranza Davivienda). Todos devuelven estructuras comunes
    (`types.ts`); `index.ts` elige el lector con `detect()`.
  - `scripts/` — herramientas locales (enmascarar PDFs/Excel, validar lectores con totales, carga masiva).
    Solo imprimen agregados, nunca contenido de documentos.
- **Frontend** (`frontend/`): React 18 + TypeScript + Vite + Tailwind. Textos de la interfaz **en español**.
  - `src/App.tsx` — pestañas Resumen / Movimientos / Plan de pagos / Deudas / Suscripciones / Importar y carga de datos del mes.
  - `src/api.ts` — cliente axios (`/api`). `src/types.ts` — tipos compartidos de la UI.
  - `src/pages/`, `src/components/`, `src/utils/` (formato COP y fechas, interés mensual).
- **Docker** (`docker-compose.yml`): `db` (MySQL), `backend` (puerto 5001), `frontend` (nginx en 5173 que
  hace proxy de `/api` al backend).

## Comandos

```bash
# Levantar todo (desde la raíz)
docker compose up --build -d

# Backend: tipos y pruebas
cd backend && npx tsc --noEmit && npm test

# Pruebas de la API (arrancan el backend contra su PROPIA base `finance_manager_test`, nunca la real)
# Necesitan MySQL arriba: docker compose up -d db
cd backend && npm run test:api

# Frontend: tipos
cd frontend && npx tsc --noEmit
```

Antes de terminar cualquier cambio: `tsc --noEmit` en backend y frontend, y `npm test` en backend deben pasar.
Las pruebas usan `node:test` con `ts-node` (`src/**/*.test.ts`). Cada error corregido debe dejar una prueba que lo atrape
(las de API están en `backend/test-api/`).

## Convenciones

- Código, nombres y comentarios en **inglés**; textos visibles para la usuaria en **español**.
- Dinero: siempre en **COP** como número (`DECIMAL` en MySQL; el pool usa `decimalNumbers: true`).
  Las compras en USD guardan `original_amount`, `original_currency` y `exchange_rate`.
- Fechas: strings `YYYY-MM-DD` (el pool usa `dateStrings: true`). Meses: `YYYY-MM`.
- Validación de entrada con zod en cada ruta; errores con `{ error, details? }`.
- Importaciones: nada se guarda sin que la usuaria revise un borrador. Cada fila importada lleva
  `import_hash` (único) para que reimportar nunca duplique; además se detectan duplicados entre fuentes
  por tipo + fecha + monto.

## Reglas del dominio (importantes)

- **Tipos de movimiento**: `income`, `expense`, `payment` (abono). Un **abono baja la deuda pero no es
  gasto**: la compra ya fue gasto cuando ocurrió.
- **Saldo de una tarjeta o préstamo** = `opening_balance` + gastos con esa cuenta − abonos.
  `balance_as_of` es la fecha hasta la que el saldo inicial ya incluye los movimientos; al importar se
  ignoran filas anteriores a esa fecha para no contarlas dos veces.
- **Intereses y cargos** son gastos con categoría propia: `Intereses`, `Cuota de manejo`, `Seguros`,
  `Comisiones`. Se reportan por separado.
- **Cada compra a cuotas tiene su propia tasa** (la vigente al comprar). La tabla de cuotas de cada
  extracto se guarda como foto en `statement_installments` (no son movimientos).
- **Abonos dirigidos** (`PAGO COMPRA ESPECIF.`, BBVA): se ligan a la compra cuyo saldo en el extracto
  anterior coincide al centavo y que desaparece en el siguiente; solo si hay una única candidata.
- **Libranzas**: se descuentan de nómina. El sueldo se registra **neto**, así que de cada cuota solo se
  registra el **capital** como abono al préstamo (los intereses y seguros quedan visibles en su plan).
- **Próximo pago** por cuenta: `due_date`, `minimum_payment`, `total_payment`, `due_cutoff` (corte del
  extracto que lo generó). Se considera pagado lo abonado con fecha **≥** `due_cutoff`.
- **Interés y corte**: la evidencia en extractos BBVA indica que el interés del extracto se calcula
  prácticamente sobre el saldo al día de corte. Regla práctica: abonar **antes del corte**.
- **Orden de aplicación de pagos en Banco de Bogotá** (no admite abonos dirigidos): mora → cobranza →
  IVA/honorarios → GMF → intereses corrientes → otros cargos → capital (primero compras a 1 cuota,
  cartera, impuestos, internacionales, avances; luego compras a cuotas más antiguas). El pago mínimo ya
  incluye las compras a 1 cuota completas.

- **Gastos fijos** (`recurring_items`): se convierten en movimientos al abrir un mes, solo desde el mes en que se
  crearon y solo hasta hoy (nunca en meses anteriores: duplicaban sueldos reales). Si ya hay un movimiento real
  (recibo de pago), se actualiza esa fila en vez de borrarla, para que el fijo no la vuelva a crear.
- **Abonos dirigidos nuevos**: se registran con descripción `PAGO COMPRA ESPECIF. — <comercio>`; el servicio los
  liga a la compra del último extracto (por nombre, o por saldo exacto si hay varias iguales). Las pantallas
  de cuotas usan `balance_after` = saldo ahora y `statement_balance` = saldo impreso en el extracto.
- **BBVA**: el pago mínimo incluye las compras a 1 cuota del periodo (verificado con extractos). Las compras en
  USD quedan por defecto a 36 cuotas (~29 % E.A.). El Excel de movimientos NO trae signo (abonos y
  reembolsos salen positivos): para distinguir cobro de reembolso se usa el PDF del extracto.
- **Meses de viaje** (`month_tags`): se marcan en Resumen; los gráficos los muestran aparte y no cuentan en el
  promedio de un mes normal. **Suscripciones**: detección automática + manuales (`manual_subscriptions`) +
  decisión Conservar/Cancelar (`subscription_marks`).

## Flujo con documentos de la usuaria

1. Copiar el archivo a `uploads/samples/` (nunca modificar el original).
2. Enmascarar: `cd backend && node scripts/mask-statement.mjs "../uploads/samples/<archivo>.pdf"`; se lee solo el
   `uploads/masked/*.masked.txt`. Para Excel, `mask-excel.mjs`.
3. La usuaria puede renunciar a revisar el texto enmascarado; aun así no se pegan datos personales en código,
   pruebas, commits ni docs.
4. No leer carpetas protegidas del sistema (Mensajes, etc.) ni saltarse permisos de macOS; pedir que arrastre el
   archivo. Nunca recibir ni usar tokens o claves pegados en el chat.

## Trabajo pendiente documentado

- `docs/plan-de-pagos.md` — especificación del generador de plan de pagos (implementado en `backend/src/services/paymentPlan.ts`, `POST /api/plan`, pestaña «Plan de pagos»).
- Pruebas e2e en navegador (Playwright, con base `finance_manager_test`): pedidas por la usuaria, aún sin hacer.
- Topes mensuales por categoría con aviso; botones «Descargar Excel» y «Agregar al calendario (.ics)» en Plan de pagos;
  vista «Hoy» en Resumen.
- Multiusuario / inicio de sesión: hoy la app es de una sola persona; si se comparte en familia, cada persona
  debe tener su propia copia y base de datos.
