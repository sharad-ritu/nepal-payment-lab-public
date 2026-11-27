export const maxAmountMinor = 99999999999;

export function parseRupeeAmount(value: string): number | null {
  if (!/^\d+(\.\d{1,2})?$/.test(value.trim())) return null;
  const [rupees, paisa = ""] = value.trim().split(".");
  const minor = Number(rupees) * 100 + Number(`${paisa}00`.slice(0, 2));
  return Number.isSafeInteger(minor) && minor <= maxAmountMinor ? minor : null;
}
export function formatRupeeAmount(minor: number): string {
  const rupees = Math.trunc(minor / 100);
  const paisa = Math.abs(minor % 100);
  if (paisa === 0) return String(rupees);
  if (paisa % 10 === 0) return `${rupees}.${paisa / 10}`;
  return `${rupees}.${String(paisa).padStart(2, "0")}`;
}
