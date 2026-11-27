export function labMerchantId(prefix: string): string {
  const hex = prefix.replace(/^lab_test_/, "");
  const value = Number.parseInt(hex.slice(0, 6), 16);

  return String((value % 900000) + 100000);
}
