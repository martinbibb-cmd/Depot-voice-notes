// ============================================================================
// DEPOT SURVEY SESSION - CloudSense Aligned Model
// Version: 1.3.0
// ============================================================================

// Core Types
export type YesNoNone = "yes" | "no" | "none";
export type Urgency = "asap" | "soon" | "flexible" | "unknown";
export type SystemType = "conventional" | "system" | "combi" | "back_boiler" | "unknown";
export type JobType = "boiler_replacement" | "full_system" | "conversion" | "new_install" | "unknown";
export type HomecareStatus = "none" | "boiler_warranty" | "multiprem_homecare" | "unknown";
export type FuelType = "natural_gas" | "lpg" | "oil" | "electric" | "unknown";
export type HSAInstallationRating = "normal" | "urgent";
export type PriorityInstallationRating = "none" | "standard" | "urgent";
export type EarthSystemType = "TT" | "TN" | "TN-S" | "TN-C-S" | "unknown";
export type PowerflushStatus = "required" | "not_required" | "recommended";
export type MagneticFilterType = "22mm" | "28mm" | "none";
export type BathroomZone = "outside" | "zone_1" | "zone_2" | "zone_3";
export type CondensateRoute = "internal_drain" | "external_soakaway" | "pumped" | "other";

export interface MissingInfoItem {
  path?: string;
  label?: string;
  detail?: string;
}

export interface QuoteLine {
  sku: string;
  description: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  category: string;
}

export interface QuoteResult {
  lines: QuoteLine[];
  grossPriceIncVat: number;
  totalDiscountIncVat: number;
  totalPricePayableIncVat: number;
}

// ============================================================================
// SECTION 0 — Session Metadata
// ============================================================================

export interface DepotSurveySessionMeta {
  sessionName?: string;
  version?: number;
  createdAt?: string;
  updatedAt?: string;
  adviser?: string;
  customerName?: string;
  customerAddress?: string;
  customerPostcode?: string;
  customerPhone?: string;
  customerEmail?: string;
  jobType?: JobType;
  source?: string;
}

// ============================================================================
// SECTION 1 — Customer Status & Vulnerability
// ============================================================================

export interface VulnerabilityInfo {
  // HSC & Urgency
  confirmHSCRating?: YesNoNone;
  boilerWorking?: YesNoNone;
  hotWaterAvailable?: YesNoNone;
  otherFormOfHeating?: YesNoNone;
  otherHeatingNotes?: string;

  // Awareness & Safety
  anythingElseToBeAwareOf?: YesNoNone;
  awarenessNotes?: string;

  // Priority & Vulnerability
  hsaInstallationRating?: HSAInstallationRating;
  vulnerabilityReason?: string; // Dropdown: 75 and over, disability, illness, etc.
  priorityInstallationRating?: PriorityInstallationRating;
  latestCustomerCategory?: string;

  // Reason for quotation
  reasonForQuotation?: string; // e.g. "Home improvements", "Boiler failure"
  reasonForSystemSelection?: string; // e.g. "Customer wants like-for-like"
  customerNeeds?: string; // Free text

  // Safety
  safetyIssuesAtProperty?: YesNoNone;
  safetyIssuesNotes?: string;

  // Legacy
  isVulnerable?: boolean;
  urgency?: Urgency;
  accessibilityNotes?: string;
}

// ============================================================================
// SECTION 2 — Existing System Overview
// ============================================================================

export interface ExistingSystemInfo {
  // System types
  existingSystemType?: SystemType;
  systemTypeRequired?: SystemType;

  // Job type
  jobTypeRequired?: JobType;

  // Homecare
  homecareStatus?: HomecareStatus;

  // Characteristics & Components
  systemCharacteristicsNotes?: string;
  componentsNeedingAssistanceForRemoval?: string;

  // Legacy fields
  systemType?: SystemType;
  jobType?: JobType;
  boilerLocation?: string;
  controls?: string;
  issues?: string[];
  systemAge?: string;
  systemHealth?: string;
  fuelType?: FuelType;
  hotWaterCylinder?: string;
  preferredBrand?: string;
}

// ============================================================================
// SECTION 3 — Electrical Survey
// ============================================================================

export interface ElectricalSurvey {
  // Earth system
  earthSystemType?: EarthSystemType;
  workingVOELCB?: YesNoNone;
  visibleEarth?: YesNoNone;

  // Customer arrangement
  customerToArrangeWorks?: YesNoNone;

  // RCD & Socket Test
  rcdPresent?: YesNoNone;
  socketAndSeeReading?: string; // "<1 ohm" or other value
  socketAndSeeLocation?: string;
  earthingBundleResult?: string; // Auto text e.g. "TN system, passed"

  // Legacy
  hasSpur?: YesNoNone;
  consumerUnitLocation?: string;
  earthingType?: string;
  bondingStatus?: string;
  rcboSpace?: YesNoNone;
  notes?: string;
}

// ============================================================================
// SECTION 4 — Working At Height
// ============================================================================

export interface WorkingAtHeight {
  // Safe access
  safeAccessAtHeightRequired?: YesNoNone;
  safeAccessPackCode?: string; // Search field
  safeAccessQuantity?: number;
  additionalStoreyCharge?: string; // Search field

  // Work description
  workDescription?: string;
  restrictionsToWorkAreas?: string;
  externalHazards?: string;

  // Legacy
  loftAccess?: YesNoNone;
  ladderHeight?: string;
  roofType?: string;
  scaffoldingRequired?: YesNoNone;
  notes?: string;
}

// ============================================================================
// SECTION 5 — Asbestos Survey
// ============================================================================

export interface AsbestosSurvey {
  // Asbestos presence
  anyArtexOrSuspectAsbestos?: YesNoNone;
  asbestosCompany?: string; // "Environmental Essentials" / "All Task" / "Other"
  numberOfAsbestosLocations?: number;
  sampleRequired?: YesNoNone;
  suspectedMaterialDetails?: string[]; // List of locations/materials

  // Legacy
  asbestosRisk?: YesNoNone;
  surveyCompleted?: YesNoNone;
  containmentRequired?: YesNoNone;
  notes?: string;
}

// ============================================================================
// SECTION 6 — Water System & Test Results
// ============================================================================

export interface WaterSystemInfo {
  // Flow & Pressure
  flowRate?: number; // l/min
  pressure?: number; // bar
  waterSystemNotes?: string;

  // Legacy
  mainsPressure?: string;
  flowRateString?: string;
  stopTapLocation?: string;
  scaleCondition?: string;
  waterQualityNotes?: string;
}

// ============================================================================
// SECTION 7 — Boiler Job Type & Location
// ============================================================================

export interface BoilerJobType {
  // System & Location Type
  systemTypeA?: string; // "A2 Conv-Conv", "A3 Conv-Conv Fully Pumped", etc.
  locationTypeB?: string; // "B1 Same room & location", "B2 Same room", etc.
  newBoilerMoreThan3MetresFromExisting?: YesNoNone;

  // Core bundle
  coreBundleName?: string; // Derived text
  waterTestFlowAndPressure?: string; // Auto from Section 6

  // Fuel & Dimensions
  fuelType?: FuelType;
  boilerDimensionsH?: number; // mm
  boilerDimensionsW?: number; // mm
  boilerDimensionsD?: number; // mm

  // Installation location
  installationLocation?: string; // "Existing" / "New" / "Loft" / "Garage" etc.
  bathroomZone?: BathroomZone;
  reasonForBoilerSelection?: string; // Dropdown

  // Legacy
  type?: JobType;
  boilerLocation?: string;
  flueType?: string;
  controls?: string;
  notes?: string;
}

// ============================================================================
// SECTION 8 — Cleansing, Protection & Controls
// ============================================================================

export interface CleansingAndProtection {
  // Cleansing
  powerflushRequired?: PowerflushStatus;

  // Protection
  magneticFilterType?: MagneticFilterType;
  install22mmGas?: YesNoNone;
  install28mmGas?: YesNoNone;

  // Flue
  flueType?: string; // Dropdown from Clearance-Genie
  additionalFlueBuildingWork?: YesNoNone;
  flueBuildingWorkNotes?: string;

  // Controls
  smartStatAlreadyInstalled?: YesNoNone;
  useExistingControls?: YesNoNone;
  controlsNotes?: string;

  // Condensate
  condensateRoute?: CondensateRoute;

  // Filling loop
  fillingLoopGroup?: string;
  fillingLoopSelection?: string;

  // Legacy
  cleansingRequired?: YesNoNone;
  inhibitorRequired?: YesNoNone;
  magneticFilter?: YesNoNone;
  notes?: string;
}

// ============================================================================
// SECTION 9 — Heat Loss Calculation
// ============================================================================

export interface HeatLossSection {
  storeys?: number;
  averageRoomHeight?: number; // metres
  sectionLength?: number; // metres
  sectionWidth?: number; // metres
  sectionHeatLossKw?: number; // kW (calculated)
  area?: string; // Legacy
  value?: number; // Legacy
  notes?: string;
}

export interface HeatLossSummary {
  propertyType?: string; // e.g. "Detached", "Semi-detached", "Terraced"
  sections?: HeatLossSection[];
  totalHeatLossKw?: number; // Auto-calculated
  notes?: string;
}

// ============================================================================
// SECTION 10 — Installer Notes (1-to-1 CloudSense mapping)
// ============================================================================

export interface InstallerNotes {
  // Delivery
  deliveryLocation?: string; // "Kitchen" / "Hallway" / etc.
  additionalDeliveryNotes?: string;

  // Office notes
  officeNotes?: string;

  // Boiler/Controls notes
  boilerControlsNotes?: string;

  // Flue notes
  flueNotes?: string;

  // Gas/Water notes
  gasWaterNotes?: string;

  // Disruption notes (decorative work, flooring, etc.)
  disruptionNotes?: string;

  // Customer agreed actions
  customerAgreedActions?: string;

  // Special requirements
  specialRequirements?: string;

  // Legacy
  disruptionLevel?: string;
  customerConcerns?: string[];
  sequencingNotes?: string;
  safetyNotes?: string;
  otherNotes?: string;
}

// ============================================================================
// SECTION 11 — Parts, Stores & Cylinders
// ============================================================================

export interface CylinderLine {
  cylinderDescription?: string;
  capacity?: number; // Litres
  productCode?: string;
  quantity?: number;

  // Legacy
  location?: string;
  volume?: string;
  coilType?: string;
  notes?: string;
}

export interface StoreLine {
  category?: string;
  subcategory?: string;
  storeCode?: string; // e.g. "P3322"
  quantity?: number;

  // Legacy
  location?: string;
  size?: string;
  notes?: string;
}

export interface RadiatorLine {
  room?: string;
  size?: string;
  type?: string;
  quantity?: number;
  notes?: string;
}

export interface MaterialItem {
  category?: string;
  subcategory?: string;
  item: string;
  productCode?: string;
  qty?: number;
  notes?: string;
}

// ============================================================================
// SECTION 12 — Discounts & Allowances
// ============================================================================

export interface AllowanceLine {
  allowanceType?: string; // Type of discount/allowance
  refNumber?: string;
  maxAmount?: number;
  actualAmount?: number;
  applied?: boolean;
  label?: string; // Legacy
  amount?: number; // Legacy
  notes?: string;
}

export interface AllowancesSummary {
  // Allowances (up to 6 rows)
  allowances?: AllowanceLine[];

  // Totals
  grossPriceIncVat?: number;
  totalDiscounts?: number;
  finalPricePayable?: number;

  // Legacy
  subtotal?: number;
  discounts?: AllowanceLine[];
  charges?: AllowanceLine[];
}

// ============================================================================
// SECTION 13 — Photos & Evidence
// ============================================================================

export interface PhotoItem {
  url?: string;
  category?: string; // "Boiler" / "Flue terminal" / "Gas route" / etc.
  caption?: string;
  timestamp?: string;
  base64?: string;
  mime?: string;
}

// ============================================================================
// AI Notes
// ============================================================================

export interface AINotes {
  customerSummary?: string;
  customerPack?: string;
  installerPack?: string;
  officeNotes?: string;
}

// ============================================================================
// MAIN SESSION INTERFACE
// ============================================================================

export interface DepotSurveySession {
  // Section 0: Metadata
  meta?: DepotSurveySessionMeta;

  // Section 1: Customer Status & Vulnerability
  vulnerability?: VulnerabilityInfo;

  // Section 2: Existing System Overview
  existingSystem?: ExistingSystemInfo;

  // Section 3: Electrical Survey
  electrical?: ElectricalSurvey;

  // Section 4: Working At Height
  workingAtHeight?: WorkingAtHeight;

  // Section 5: Asbestos Survey
  asbestos?: AsbestosSurvey;

  // Section 6: Water System & Test Results
  waterSystem?: WaterSystemInfo;

  // Section 7: Boiler Job Type & Location
  boilerJob?: BoilerJobType;

  // Section 8: Cleansing, Protection & Controls
  cleansing?: CleansingAndProtection;

  // Section 9: Heat Loss Calculation
  heatLoss?: HeatLossSummary;

  // Section 10: Installer Notes
  installerNotes?: InstallerNotes;

  // Section 11: Parts, Stores & Cylinders
  stores?: StoreLine[];
  cylinders?: CylinderLine[];
  radiators?: RadiatorLine[];
  materials?: MaterialItem[];

  // Section 12: Discounts & Allowances
  allowances?: AllowancesSummary;

  // Section 13: Photos & Evidence
  photos?: PhotoItem[];

  // AI & Processing
  ai?: AINotes;

  // Legacy & Utility
  sections?: any[]; // Legacy voice sections
  missingInfo?: Array<string | MissingInfoItem>;
  fullTranscript?: string;
  checkedItems?: any;
  quoteNotes?: any;
  formData?: any;
  locations?: any;
  distances?: any;
  audioBase64?: string;
  audioMime?: string;
  quote?: QuoteResult;
}

export default DepotSurveySession;
