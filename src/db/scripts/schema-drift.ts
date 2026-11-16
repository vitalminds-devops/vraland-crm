export interface ExpectedTable {
  table: string;
  columns: string[];
}

export function findMissingColumns(
  expected: ExpectedTable[],
  actual: Map<string, Set<string>>,
): string[] {
  const missing: string[] = [];
  for (const { table, columns } of expected) {
    const live = actual.get(table);
    if (!live) {
      missing.push(table);
      continue;
    }
    for (const column of columns) {
      if (!live.has(column)) missing.push(`${table}.${column}`);
    }
  }
  return missing;
}
