// Who runs the site, for the Impressum (§ 5 DDG) and the privacy policy. A German site needs a
// name, a postal address where letters reach you (no P.O. box) and a way to contact you quickly
// (an email address). Until it's filled in, the Impressum says it's being set up.

export interface Operator {
  name: string;
  address: string[]; // street and number, postcode and city, country
  email: string;
}

export const OPERATOR: Operator | null = null;
