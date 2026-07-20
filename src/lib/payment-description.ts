/**
 * Payment description shown in the operator's records and the customer's
 * notification/statement. Always "Foocci - <restaurant name>" (brand + the
 * client's restaurant), per the product owner. Falls back to "Foocci" alone
 * when the name is missing.
 */
export function paymentDescription(restaurantName?: string | null): string {
  const name = (restaurantName ?? "").trim();
  return name ? `Foocci - ${name}` : "Foocci";
}
