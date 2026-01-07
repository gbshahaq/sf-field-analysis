export type StringMap = Record<string, string>;
export type TextMap = Record<string, string>;

export interface ResultRow {
  FieldName: string;
  FieldLabel: string;
  Description: string;
  FieldType: string;
  Formula: string;
  FieldLength: string;
  LookupRef: string;
  Required: "TRUE" | "FALSE";
  HistoryTracking: string;
  PicklistValues: string;
  ControllingField: string;
  LastModifiedDate: string;
  Layouts: string;
  Flexipages: string;
  RecordTypes: string;
  References: string; // lines joined by ;\n
  ProfilesAndPermSets: string; 
}
