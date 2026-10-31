import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { test } from 'node:test';

/**
 * Guards the EN/ES translation work:
 *  1. both language files have the same keys, non-empty values and the same {{variables}};
 *  2. screens that are already translated must not get hard-coded Spanish back;
 *  3. screens not translated yet are listed below. The list can only shrink: new Spanish text in a screen that is
 *     not listed fails, and a listed screen that is clean fails until it is removed from the list.
 */
const root = new URL('..', import.meta.url).pathname;
const read = path => readFileSync(join(root, path), 'utf8');
const en = JSON.parse(read('src/i18n/locales/en.json'));
const es = JSON.parse(read('src/i18n/locales/es.json'));

// Screens whose text is still hard-coded in Spanish. Remove a file from here when it is translated.
const PENDING = [
  'src/App.tsx',
  'src/components/AccountForm.tsx',
  'src/components/CategoryBreakdown.tsx',
  'src/components/ExtraPaymentPlanner.tsx',
  'src/components/FeesBreakdown.tsx',
  'src/components/InterestBreakdown.tsx',
  'src/components/MonthPlan.tsx',
  'src/components/PieChart.tsx',
  'src/components/SpendingByMonth.tsx',
  'src/components/TransactionForm.tsx',
  'src/components/TransactionList.tsx',
  'src/components/UpcomingPayments.tsx',
  'src/pages/AccountDetailPage.tsx',
  'src/pages/AccountsPage.tsx',
  'src/pages/ImportPage.tsx',
  'src/pages/PaymentPlanPage.tsx',
  'src/pages/SubscriptionsPage.tsx',
  'src/pages/SummaryPage.tsx',
  'src/pages/TransactionsPage.tsx'
];

const flatten = (object, prefix = '') =>
  Object.entries(object).flatMap(([key, value]) =>
    typeof value === 'object' ? flatten(value, `${prefix}${key}.`) : [[`${prefix}${key}`, value]]
  );

const sourceFiles = (dir = 'src') =>
  readdirSync(join(root, dir)).flatMap(name => {
    const path = join(dir, name);
    if (path.startsWith('src/i18n')) return [];
    if (statSync(join(root, path)).isDirectory()) return sourceFiles(path);
    return /\.tsx?$/.test(name) ? [path] : [];
  });

// Accented letters, or common Spanish words inside string literals and JSX text. Comments are ignored (they are English).
const ACCENTS = /[áéíóúñÁÉÍÓÚÑ¿¡]/;
const WORDS =
  /\b(el|la|los|las|de|del|para|por|con|sin|tus|tu|mes|meses|pago|pagos|gasto|gastos|ingreso|ingresos|cargando|guardar|cancelar|eliminar|tarjeta|tarjetas|abono|abonos|deuda|deudas|otros|datos|hoy)\b/i;
const textSegments = line => [...line.matchAll(/'([^']*)'|"([^"]*)"|`([^`]*)`|>([^<>{}]+)</g)].map(m => m[1] ?? m[2] ?? m[3] ?? m[4]);
const hasSpanishText = path =>
  read(path)
    .split('\n')
    .map(line => line.replace(/\/\/.*$/, ''))
    .some(line => ACCENTS.test(line) || textSegments(line).some(text => WORDS.test(text)));

test('English and Spanish have exactly the same keys', () => {
  const enKeys = flatten(en).map(([key]) => key).sort();
  const esKeys = flatten(es).map(([key]) => key).sort();
  assert.deepEqual(enKeys, esKeys);
});

test('no translation is empty and both languages use the same {{variables}}', () => {
  const variables = text => (text.match(/{{\s*\w+\s*}}/g) ?? []).sort().join();
  const esByKey = new Map(flatten(es));
  for (const [key, english] of flatten(en)) {
    assert.ok(english.trim() && esByKey.get(key).trim(), `empty translation for ${key}`);
    assert.equal(variables(english), variables(esByKey.get(key)), `different {{variables}} in ${key}`);
  }
});

test('translated screens contain no hard-coded Spanish', () => {
  const offenders = sourceFiles().filter(path => !PENDING.includes(path) && hasSpanishText(path));
  assert.deepEqual(offenders, [], 'use t("section.key") and add the text to both language files');
});

test('the pending list only holds screens that still have Spanish text', () => {
  const clean = PENDING.filter(path => !hasSpanishText(path));
  assert.deepEqual(clean, [], 'these screens are translated now: remove them from PENDING');
});
