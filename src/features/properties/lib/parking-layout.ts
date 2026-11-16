export function parkingBayPosition(index: number, count: number): [number, number, number] {
  const columns = Math.ceil(count / 2);
  return [((index % columns) - (columns - 1) / 2) * 2.2, 0, index < columns ? -2.7 : 2.7];
}
