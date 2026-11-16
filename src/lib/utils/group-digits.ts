/** "5557727277711" -> "5557 7272 7771 1". Values with other characters (e.g. "123-456-789") are left as typed. */
export function groupDigits(value: string): string {
  if (!/^[\d\s]*$/.test(value)) return value;
  return value.replace(/\s/g, "").replace(/(\d{4})(?=\d)/g, "$1 ");
}
