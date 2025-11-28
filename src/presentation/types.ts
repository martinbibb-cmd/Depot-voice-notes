export interface PresentationSection {
  title: string;
  body?: string;
  items?: string[];
}

export interface PresentationTable {
  title?: string;
  headers: string[];
  rows: (string | number | null | undefined)[][];
}

export interface PresentationDocument {
  title: string;
  sections: PresentationSection[];
  tables?: PresentationTable[];
}

export interface PresentationBundle {
  customerPack: PresentationDocument;
  installerPack: PresentationDocument;
  officePack: PresentationDocument;
}

export default PresentationBundle;
