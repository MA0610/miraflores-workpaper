// Shapes of the pipeline packet, as delivered. Read-only: the workpaper never mutates it.

export interface Page { page: number; printed_content: string }
export interface Doc {
  id: string;
  title: string;
  document_type: string;
  issuer?: string;
  belongs_to: string;
  tax_year?: number;
  received_at: string;
  uploaded_by: 'client' | 'firm';
  file_name?: string;
  page_count: number;
  pages: Page[];
  marked_corrected?: boolean;
  extraction?: { status: 'extracted' | 'partial' | 'not_extracted'; values?: number; reason?: string } | null;
}
export interface Box { x0: number; y0: number; x1: number; y1: number }
export interface EV {
  id: string;
  document_id: string;
  page: number;
  field: string;
  label: string;
  value: any;
  value_type: string;
  text_as_read: string;
  position: Box;
  confidence: number;
}
export interface Line {
  key: string;
  jurisdiction: 'federal' | 'california';
  form: string;
  line: string;
  label: string;
  value: any;
  rule: string;
  inputs: string[];
  sources: string[];
  note?: string | null;
}
export interface Summary {
  federal: { agi: number; taxable_income: number; total_tax: number; payments: number; balance_due: number; penalty: number };
  california: { total_agi: number; ca_agi: number; total_tax: number; payments: number; balance_due: number; penalty: number };
}
export type RateCat = 'wages' | 'interest' | 'schc_profit' | 'stcg' | 'ltcg' | 'ordinary_income' | 'adjustment' | 'salt' | 'itemized' | 'ca_source_income';
export interface Version {
  version: string;
  computed_at: string;
  trigger: string;
  documents_used: string[];
  documents_superseded: string[];
  summary: Summary;
  tax_effect_rates: Record<RateCat, { federal_per_dollar: number; california_per_dollar: number }>;
  carryovers_out: any;
  assets: any[];
  diagnostics: { code: string; severity: 'info' | 'warning'; message: string; refs: string[] }[];
  changes_from_previous: { key: string; change: 'added' | 'changed' | 'removed'; old?: any; new?: any }[];
  lines: Line[];
}
export interface Staff { id: string; name: string; role: string; credential: string | null; sensitive_data_clearance: boolean; active_from: string; note?: string }
export interface Person { id: string; role: string; name: string; ssn: string; dob: string; [k: string]: any }
export interface TimelineEvent { id: string; at: string; event: string; actor: string | null; detail: string | null; refs: string[] }
export interface Packet {
  packet: { name: string; version: string; generated: string; client_id: string };
  readme: any;
  household: { filing_status: string; tax_year: number; people: Person[]; addresses: any[]; residency: any[]; bank_account_for_refund_or_payment: any; prior_year_agi_for_esignature: number; related_returns: any[] };
  documents: Doc[];
  extracted_values: EV[];
  client: {
    questionnaire: { id: string; question: string; answer: string; answered_by: string; answered_at: string }[];
    messages: { id: string; sent_at: string; from: string; to: string; text: string }[];
    call_notes: { id: string; date: string; participants: string[]; notes: string[] }[];
  };
  firm: {
    name: string;
    staff: Staff[];
    firm_identity: any;
    client_users: { id: string; name: string; role: string }[];
    assignment_at_start: { preparer: string; reviewer: string; partner: string };
    deadlines: { what: string; date: string }[];
    budget_hours: Record<string, number>;
    starter_standards: any;
  };
  prior_years: any;
  tax_agency_records: any;
  timeline: TimelineEvent[];
  engine_reference: { parameters: Record<string, any>; rules: Record<string, string> };
  return_versions: Version[];
  what_if: { alternatives: any[]; extension: any };
  planning_reference_2026: any;
  post_filing_rates: any;
  fx_rates: any;
}
