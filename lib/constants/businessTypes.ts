export const BUSINESS_TYPES = [
  "proprietorship",
  "partnership",
  "llp",
  "private_limited",
  "public_limited",
  "huf",
  "other",
] as const;
export type BusinessType = (typeof BUSINESS_TYPES)[number];

export const BUSINESS_TYPE_LABELS: Record<BusinessType, string> = {
  proprietorship: "Proprietorship",
  partnership: "Partnership",
  llp: "LLP",
  private_limited: "Private Limited",
  public_limited: "Public Limited",
  huf: "HUF",
  other: "Other",
};
