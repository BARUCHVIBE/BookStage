export type OrganizationProfile = {
  id: string;
  name: string;
  slug: string;
  email: string;
  phone?: string | null;
  document?: string | null;
  website?: string | null;
  instagram?: string | null;
  logo?: string | null;
  description?: string | null;
  role: string;
};
