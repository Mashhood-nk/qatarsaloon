// Phone numbers are stored in E.164 form (+974XXXXXXXX). The first block of countries
// is the most common in Qatar and is shown at the top of the picker.

export interface Country {
  iso: string;
  name: string;
  dial: string; // without '+'
}

export const COMMON_COUNTRIES: Country[] = [
  { iso: "QA", name: "Qatar", dial: "974" },
  { iso: "IN", name: "India", dial: "91" },
  { iso: "PK", name: "Pakistan", dial: "92" },
  { iso: "BD", name: "Bangladesh", dial: "880" },
  { iso: "NP", name: "Nepal", dial: "977" },
  { iso: "LK", name: "Sri Lanka", dial: "94" },
  { iso: "PH", name: "Philippines", dial: "63" },
  { iso: "EG", name: "Egypt", dial: "20" },
];

export const OTHER_COUNTRIES: Country[] = [
  { iso: "AE", name: "United Arab Emirates", dial: "971" },
  { iso: "SA", name: "Saudi Arabia", dial: "966" },
  { iso: "KW", name: "Kuwait", dial: "965" },
  { iso: "BH", name: "Bahrain", dial: "973" },
  { iso: "OM", name: "Oman", dial: "968" },
  { iso: "JO", name: "Jordan", dial: "962" },
  { iso: "LB", name: "Lebanon", dial: "961" },
  { iso: "SY", name: "Syria", dial: "963" },
  { iso: "IQ", name: "Iraq", dial: "964" },
  { iso: "YE", name: "Yemen", dial: "967" },
  { iso: "PS", name: "Palestine", dial: "970" },
  { iso: "SD", name: "Sudan", dial: "249" },
  { iso: "TN", name: "Tunisia", dial: "216" },
  { iso: "MA", name: "Morocco", dial: "212" },
  { iso: "DZ", name: "Algeria", dial: "213" },
  { iso: "TR", name: "Türkiye", dial: "90" },
  { iso: "IR", name: "Iran", dial: "98" },
  { iso: "AF", name: "Afghanistan", dial: "93" },
  { iso: "ID", name: "Indonesia", dial: "62" },
  { iso: "MY", name: "Malaysia", dial: "60" },
  { iso: "TH", name: "Thailand", dial: "66" },
  { iso: "VN", name: "Vietnam", dial: "84" },
  { iso: "CN", name: "China", dial: "86" },
  { iso: "KE", name: "Kenya", dial: "254" },
  { iso: "UG", name: "Uganda", dial: "256" },
  { iso: "ET", name: "Ethiopia", dial: "251" },
  { iso: "NG", name: "Nigeria", dial: "234" },
  { iso: "GH", name: "Ghana", dial: "233" },
  { iso: "ZA", name: "South Africa", dial: "27" },
  { iso: "GB", name: "United Kingdom", dial: "44" },
  { iso: "US", name: "United States / Canada", dial: "1" },
  { iso: "FR", name: "France", dial: "33" },
  { iso: "DE", name: "Germany", dial: "49" },
  { iso: "IT", name: "Italy", dial: "39" },
  { iso: "ES", name: "Spain", dial: "34" },
  { iso: "AU", name: "Australia", dial: "61" },
];

export const ALL_COUNTRIES = [...COMMON_COUNTRIES, ...OTHER_COUNTRIES];

/** Builds +<dial><number>, dropping spaces, dashes and a leading trunk 0. Returns null if implausible. */
export function toE164(dial: string, local: string): string | null {
  const d = dial.replace(/\D/g, "");
  let n = local.replace(/\D/g, "");
  if (local.trim().startsWith("+")) {
    // The person typed a full international number; trust it.
    return n.length >= 8 && n.length <= 15 ? `+${n}` : null;
  }
  n = n.replace(/^0+/, "");
  if (n.startsWith(d) && n.length - d.length >= 7) n = n.slice(d.length); // pasted with country code
  if (n.length < 6 || n.length > 12) return null;
  return `+${d}${n}`;
}

export function isE164(s: string): boolean {
  return /^\+\d{8,15}$/.test(s);
}

/** Splits an E.164 number into a known dial code and the rest (for display and editing). */
export function splitE164(e164: string): { dial: string; local: string } {
  const digits = e164.replace(/^\+/, "");
  const match = [...ALL_COUNTRIES].sort((a, b) => b.dial.length - a.dial.length).find((c) => digits.startsWith(c.dial));
  if (!match) return { dial: "", local: digits };
  return { dial: match.dial, local: digits.slice(match.dial.length) };
}

/** "+974 5512 3456" style for display. */
export function fmtPhone(e164: string | null | undefined): string {
  if (!e164) return "";
  const { dial, local } = splitE164(e164);
  if (!dial) return e164;
  const groups = local.length > 8 ? local.replace(/(\d{5})(\d+)/, "$1 $2") : local.replace(/(\d{4})(\d+)/, "$1 $2");
  return `+${dial} ${groups}`;
}

/** A wa.me link that opens WhatsApp with the message ready to send. */
export function waLink(e164: string, text: string): string {
  return `https://wa.me/${e164.replace(/\D/g, "")}?text=${encodeURIComponent(text)}`;
}
