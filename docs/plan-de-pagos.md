# Especificación: generador de plan de pagos

> Lee primero `CLAUDE.md` (privacidad, estructura, reglas del dominio). Todo el ejemplo de este documento usa
> **datos inventados**; no uses datos reales en código, pruebas ni PRs.

## Objetivo

Dado el dinero disponible hoy, los ingresos esperados y las deudas, generar una **lista ordenada de pagos con
fecha** que:

1. Pague **todos los mínimos antes de su fecha límite**, con dinero que exista para esa fecha.
2. Pague los **gastos fijos** (p. ej. arriendo) el día del ingreso.
3. Aparte una **reserva** para pagar completas las compras a 1 cuota (que no cobran interés si se pagan
   completas).
4. Use **todo lo demás** para abonar a compras **con interés**, empezando por la **tasa más alta** y
   abonando **antes del corte** de cada tarjeta.
5. Respete cómo aplica los pagos cada banco (abonos dirigidos o no).
6. **Cuadre**: cada peso de entrada tiene un destino (o queda explícitamente "libre").

Debe reproducir el razonamiento que hoy se hace a mano y mostrarse en la app con un botón **"Hecho"** por paso
que registra el pago.

## Datos de entrada

### Ya existen en la BD

| Dato | De dónde |
|---|---|
| Mínimos pendientes por cuenta | `Account.upcomingPayments()` → `due_date`, `minimum_payment`, `paid_since_cutoff`; pendiente = `max(minimum_payment − paid_since_cutoff, 0)` |
| Día de corte de cada cuenta | día del mes de `due_cutoff`; el próximo corte es la siguiente ocurrencia de ese día ≥ hoy (día 31 → último día del mes) |
| Compras con saldo y tasa | `Installment.latestForAll()` (última foto de cuotas por cuenta): `balance_after > 0`; con interés si `rate > 0` |
| Ingresos y gastos fijos | `Recurring.findAll()` (`day_of_month`) |

### Nuevo en la BD

- `accounts.allows_directed_payments TINYINT(1) NOT NULL DEFAULT 0` — si el banco permite abonar a una
  compra específica (BBVA: sí). Migración idempotente en `db/init.ts` y campo editable en la UI de la tarjeta.

### Del formulario (no se guardan, o se guardan como preferencia local)

| Campo | Ejemplo | Notas |
|---|---|---|
| `cash_now` | 2.000.000 | dinero disponible hoy |
| `reserve_one_installment` | 800.000 | sugerir por defecto el gasto con tarjeta del último mes completo (compras, sin intereses ni cargos) |
| `extra_incomes[]` | `{ description, amount, date, target? }` | p. ej. venta de un equipo; `target` opcional = una compra concreta a la que se destina |
| `strategy` | `fewer` \| `finish` | entre compras de igual tasa: `fewer` = saldos grandes primero (pocos pagos); `finish` = saldos pequeños primero (termina más compras) |
| `today` | 2026-03-10 | fecha local del navegador |

## Algoritmo

Implementarlo como **función pura** en `backend/src/services/paymentPlan.ts` (sin BD), con pruebas en
`paymentPlan.test.ts`. La ruta solo reúne los datos y llama a la función.

**Horizonte:** desde `today` hasta el **segundo** ingreso recurrente (así entran los mínimos que vencen
después del primer sueldo pero antes del siguiente).

**Fuentes de dinero (bolsas)**, cada una con fecha desde la que está disponible:
`cash_now` (hoy), cada ingreso recurrente del horizonte (su fecha), cada `extra_income` (su fecha).

1. **Mínimos.** Para cada mínimo pendiente con `due_date` dentro del horizonte, ordenados por `due_date`:
   tomar dinero de la bolsa disponible **más temprana que llegue antes de `due_date`**. Paso con fecha
   = `max(fecha de la bolsa, today)` y ventana "antes de `due_date`". Si no alcanza, generar el paso por lo
   que haya y una **advertencia** con el faltante.
2. **Gastos fijos.** Cada gasto recurrente del horizonte sale de la bolsa del ingreso de ese día (o de la
   más temprana disponible). Son pasos del día del ingreso ("se descuenta de una").
3. **Reserva 1 cuota.** Se aparta de la bolsa del primer ingreso recurrente (paso informativo: "reservar
   para pagar completas las compras a 1 cuota cuando venzan").
4. **Ingresos extra con destino.** Cada `extra_income` con `target` se aplica a esa compra (si la cuenta
   permite abonos dirigidos) en su fecha. Si no alcanza para terminarla, la compra entra al paso 5 por el
   resto con prioridad máxima entre las de su tasa (terminarla). Si sobra, el sobrante vuelve a su bolsa.
   Advertir si la fecha es posterior al próximo corte de esa cuenta.
5. **Abonos extra.** Construir los **destinos**:
   - Cuenta **con** abonos dirigidos: cada compra con interés y saldo es un destino (tasa = la de la
     compra).
   - Cuenta **sin** abonos dirigidos: **un** destino por cuenta = suma de saldos de sus compras con interés,
     tasa = la mayor de esas compras. Nota en el paso: "pide que el excedente vaya a capital".
   - Ordenar por: tasa (desc, redondeada a 0,1) → próximo corte (asc) → saldo según `strategy`.
   - Repartir cada bolsa sobrante en ese orden, **en orden cronológico de bolsas**: el dinero de hoy va
     primero a los destinos de mayor prioridad; el de cada ingreso, a lo que quede. Un destino recibe como
     máximo su saldo pendiente.
   - Fecha del paso = fecha de la bolsa. Si es posterior al próximo corte del destino, marcarlo
     `after_cutoff: true` (se muestra en ámbar).
6. **Sobrante.** Lo que no tenga destino queda como paso "libre" (sin compras con interés por pagar).

**Ahorro estimado** de cada abono extra: `monto × ((1 + tasa/100)^(1/12) − 1)` (interés mensual evitado).

## Salida

```ts
interface PlanStep {
  order: number;
  date: string;              // YYYY-MM-DD en que se puede hacer
  due_by?: string;           // fecha límite (mínimos) o próximo corte (abonos)
  kind: 'minimum' | 'fixed' | 'reserve' | 'directed' | 'extra_capital' | 'free';
  account_id?: number;
  account_name?: string;
  purchase?: { description: string; purchase_date: string; balance: number; rate: number };
  amount: number;
  source: string;            // "Dinero de hoy", "Sueldo 25 mar", "Venta equipo"
  monthly_saving?: number;
  finishes_purchase?: boolean;
  after_cutoff?: boolean;
  note?: string;
}
interface PaymentPlan {
  steps: PlanStep[];
  totals: { inflows: number; minimums: number; fixed: number; reserve: number; extra: number; free: number; monthly_saving: number };
  warnings: string[];
}
```

Invariante a probar: `inflows === minimums + fixed + reserve + extra + free` (al centavo).

## API

- `POST /api/plan` — body: `{ today, cash_now, reserve_one_installment, extra_incomes, strategy }`
  (validado con zod) → `PaymentPlan`.
- Registrar "Hecho": reutilizar `POST /api/transactions` (`type: 'payment'`, `account_id`) para mínimos y
  abonos; para abonos dirigidos, usar descripción `PAGO COMPRA ESPECIF. — <compra>` para que el enlazador
  de abonos pueda cruzarlo. Los pasos `fixed`/`reserve`/`free` no registran nada.

## Interfaz

Nueva sección **"Plan de pagos"** (pestaña propia o arriba en Resumen):

- Formulario: dinero disponible hoy, reserva 1 cuota (con el valor sugerido), ingresos extra (agregar/quitar:
  descripción, monto, fecha, compra destino opcional con un selector de compras con interés), estrategia.
- Resultado: tabla en orden con fecha grande, cuenta, a qué (compra o "mínimo"), monto, de dónde sale,
  ahorro/mes y botón **"Hecho"**. Totales y advertencias arriba.
- Textos en español, formato COP (`formatCOP`), fechas con `formatLongDay`.

## Ejemplo de aceptación (datos inventados)

**Entrada** — `today = 2026-03-10`, `cash_now = 2.000.000`, `reserve = 800.000`, `strategy = fewer`.
Fijos: sueldo neto 5.000.000 día 25; arriendo 1.500.000 día 25.
Extra: "Venta equipo" 1.000.000 el 2026-03-20, destino compra LAPTOP (Tarjeta A).

| Cuenta | Dirigidos | Corte | Mínimo pendiente | Compras con saldo |
|---|---|---|---|---|
| Tarjeta A | sí | día 30 | 600.000, vence 2026-03-30 | LAPTOP 1.200.000 al 29,0% · TIENDA X 300.000 al 29,5% · SUPER Y 100.000 al 0% |
| Tarjeta B | no | día 28 | 200.000, vence 2026-03-15 | diferido 900.000 al 29,8% |
| Tarjeta C | sí | día 15 | 300.000, vence 2026-04-05 | VIAJE 2.000.000 al 28,0% |

**Salida esperada** (orden y montos):

| # | Fecha | Paso | Monto | Fuente |
|---|---|---|---:|---|
| 1 | 2026-03-10 | Tarjeta B — mínimo (antes del 15 mar) | 200.000 | Dinero de hoy |
| 2 | 2026-03-10 | Tarjeta B — abono a capital (29,8%) | 900.000 | Dinero de hoy |
| 3 | 2026-03-10 | Tarjeta A — TIENDA X (29,5%), la termina | 300.000 | Dinero de hoy |
| 4 | 2026-03-10 | Tarjeta A — LAPTOP (29,0%), resto no cubierto por la venta | 200.000 | Dinero de hoy |
| 5 | 2026-03-10 | Tarjeta C — VIAJE (28,0%) | 400.000 | Dinero de hoy |
| 6 | 2026-03-20 | Tarjeta A — LAPTOP, la termina | 1.000.000 | Venta equipo |
| 7 | 2026-03-25 | Arriendo | 1.500.000 | Sueldo 25 mar |
| 8 | 2026-03-25 | Tarjeta A — mínimo (antes del 30 mar) | 600.000 | Sueldo 25 mar |
| 9 | 2026-03-25 | Tarjeta C — mínimo (antes del 5 abr) | 300.000 | Sueldo 25 mar |
| 10 | 2026-03-25 | Reserva compras a 1 cuota | 800.000 | Sueldo 25 mar |
| 11 | 2026-03-25 | Tarjeta C — VIAJE (28,0%), la termina | 1.600.000 | Sueldo 25 mar |
| 12 | 2026-03-25 | Libre (no quedan compras con interés) | 200.000 | Sueldo 25 mar |

Comprobación: entradas 2.000.000 + 1.000.000 + 5.000.000 = 8.000.000 = mínimos 1.100.000 + fijos 1.500.000 +
reserva 800.000 + extra 4.400.000 + libre 200.000. SUPER Y (0%) nunca recibe abono extra.

Las pruebas deben cubrir además: mínimo que no alcanza (advertencia), cuenta sin abonos dirigidos (un solo
destino), abono posterior al corte (`after_cutoff`), ingreso extra mayor que el saldo de su destino
(sobrante vuelve a la bolsa) y estrategia `finish` (saldos pequeños primero entre tasas iguales).

## Fuera de alcance

- Varios usuarios / inicio de sesión.
- Cambiar el número de cuotas o simular reducción de plazo vs. cuota.
- Recomendaciones de inversión (la app solo ordena pagos de deuda con reglas explícitas).
