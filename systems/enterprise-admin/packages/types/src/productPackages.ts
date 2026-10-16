import type { Product, PosProduct } from './index';

export interface PackageIdentifier {
  namespace: 'MANUFACTURER' | 'GTIN';
  value: string;
}
export interface PackageRevisionInput {
  label: string;
  contents: string;
  stockUnitLabel: string;
  unitsPerPackage: number | null;
  source: string;
  reason: string;
  validFrom: string;
  validUntil: string | null;
  identifiers: PackageIdentifier[];
}
export interface PackageRevisionRequest {
  expectedRevision: number;
  /** State observed when selecting the revision; omission means an active revision. */
  expectedRetired?: boolean;
  data: PackageRevisionInput;
}
export interface PackageRevision extends Omit<PackageRevisionInput, 'stockUnitLabel'> {
  id: string;
  packageId: string;
  tenantId: string;
  revision: number;
  actorId: string;
  createdAt: string;
  retiredAt: string | null;
  retiredById: string | null;
  retirementReason: string | null;
}
export interface ProductPackageHistory {
  product: Product & { stockUnitLabel: string | null };
  packages: { id: string; revision: number; revisions: PackageRevision[] }[];
}
export interface PackageCandidate {
  packageId: string;
  revisionId: string;
  revision: number;
  label: string;
  contents: string;
  unitsPerPackage: number | null;
  stockUnitLabel: string | null;
  source: string;
  validFrom: string;
  validUntil: string | null;
  product: PosProduct;
}
