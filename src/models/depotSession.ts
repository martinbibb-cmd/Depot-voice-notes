export type YesNoNone = "yes" | "no" | "none";
export type Urgency = "asap" | "soon" | "flexible" | "unknown";
export type SystemType = "combi" | "system" | "regular" | "back_boiler" | "unknown";
export type JobType = "swap" | "conversion" | "new_install" | "unknown";
export type HomecareStatus = "active" | "lapsed" | "none" | "unknown";
export type FuelType = "gas" | "lpg" | "oil" | "electric" | "unknown";

export interface DepotSurveySessionMeta {
  sessionName?: string;
  version?: number;
  createdAt?: string;
  adviser?: string;
  customerName?: string;
  customerAddress?: string;
  jobType?: JobType;
  source?: string;
}

export interface VulnerabilityInfo {
  isVulnerable?: boolean;
  reasonForQuotation?: string;
  urgency?: Urgency;
  customerNeeds?: string[];
  accessibilityNotes?: string;
}

export interface ExistingSystemInfo {
  systemType?: SystemType;
  jobType?: JobType;
  boilerLocation?: string;
  controls?: string;
  issues?: string[];
  systemAge?: string;
  systemHealth?: string;
  homecareStatus?: HomecareStatus;
  fuelType?: FuelType;
  hotWaterCylinder?: string;
  preferredBrand?: string;
}

export interface ElectricalSurvey {
  hasSpur?: YesNoNone;
  consumerUnitLocation?: string;
  earthingType?: string;
  bondingStatus?: string;
  rcboSpace?: YesNoNone;
  notes?: string;
}

export interface WorkingAtHeight {
  loftAccess?: YesNoNone;
  ladderHeight?: string;
  roofType?: string;
  scaffoldingRequired?: YesNoNone;
  notes?: string;
}

export interface AsbestosSurvey {
  asbestosRisk?: YesNoNone;
  surveyCompleted?: YesNoNone;
  containmentRequired?: YesNoNone;
  notes?: string;
}

export interface WaterSystemInfo {
  mainsPressure?: string;
  flowRate?: string;
  stopTapLocation?: string;
  scaleCondition?: string;
  waterQualityNotes?: string;
}

export interface BoilerJobType {
  type?: JobType;
  boilerLocation?: string;
  flueType?: string;
  controls?: string;
  notes?: string;
}

export interface CleansingAndProtection {
  cleansingRequired?: YesNoNone;
  inhibitorRequired?: YesNoNone;
  magneticFilter?: YesNoNone;
  notes?: string;
}

export interface HeatLossSection {
  area?: string;
  value?: number;
  notes?: string;
}

export interface HeatLossSummary {
  totalHeatLossKw?: number;
  sections?: HeatLossSection[];
  notes?: string;
}

export interface InstallerNotes {
  disruptionLevel?: string;
  customerConcerns?: string[];
  sequencingNotes?: string;
  safetyNotes?: string;
  otherNotes?: string;
}

export interface AllowanceLine {
  label: string;
  amount?: number;
  notes?: string;
}

export interface AllowancesSummary {
  subtotal?: number;
  discounts?: AllowanceLine[];
  charges?: AllowanceLine[];
}

export interface StoreLine {
  location?: string;
  size?: string;
  notes?: string;
}

export interface CylinderLine {
  location?: string;
  volume?: string;
  coilType?: string;
  notes?: string;
}

export interface RadiatorLine {
  room?: string;
  size?: string;
  type?: string;
  notes?: string;
}

export interface MaterialItem {
  category?: string;
  item: string;
  qty?: number;
  notes?: string;
}

export interface AINotes {
  customerSummary?: string;
  customerPack?: string;
  installerPack?: string;
  officeNotes?: string;
}

export interface DepotSurveySession {
  meta?: DepotSurveySessionMeta;
  vulnerability?: VulnerabilityInfo;
  existingSystem?: ExistingSystemInfo;
  electrical?: ElectricalSurvey;
  workingAtHeight?: WorkingAtHeight;
  asbestos?: AsbestosSurvey;
  waterSystem?: WaterSystemInfo;
  boilerJob?: BoilerJobType;
  cleansing?: CleansingAndProtection;
  heatLoss?: HeatLossSummary;
  installerNotes?: InstallerNotes;
  allowances?: AllowancesSummary;
  stores?: StoreLine[];
  cylinders?: CylinderLine[];
  radiators?: RadiatorLine[];
  materials?: MaterialItem[];
  ai?: AINotes;
  sections?: any[];
  missingInfo?: string[];
  fullTranscript?: string;
  photos?: any[];
  checkedItems?: any;
  quoteNotes?: any;
  formData?: any;
  locations?: any;
  distances?: any;
  audioBase64?: string;
  audioMime?: string;
}

export default DepotSurveySession;
