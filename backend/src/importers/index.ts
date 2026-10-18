import { bbvaReader } from './bbva';
import { bogotaReader } from './bogota';
import { nuReader } from './nu';
import type { ParsedStatement, StatementPages, StatementReader } from './types';

const READERS: StatementReader[] = [bbvaReader, nuReader, bogotaReader];

export function parseStatement(pages: StatementPages): ParsedStatement | null {
  const reader = READERS.find(r => r.detect(pages));
  return reader ? reader.parse(pages) : null;
}

export const SUPPORTED_BANKS = READERS.map(r => r.bank);
export type { DraftItem, DraftKind, ParsedStatement, StatementPages } from './types';
