import type { RateCat } from '../data/types';

/**
 * The workpaper is an append-only ledger of events laid over the read-only packet.
 * Nothing is edited in place: corrections, undo, reopening and amendment are new events.
 */
export type EventType =
  | 'verify' // a person checked a target and says how
  | 'adjust' // propose a change to a line or extracted value (original kept)
  | 'adjust_decision' // approve / reject a proposed adjustment
  | 'note' // review note or comment; can block filing
  | 'note_reply'
  | 'note_status' // resolve / reopen a note
  | 'question' // to the client or a colleague
  | 'answer' // the answer becomes evidence
  | 'judgment' // judgment call, election, due diligence, penalty decision, diagnostic resolution
  | 'finding_resolve' // close an independent check with a reason
  | 'signoff'
  | 'assign'
  | 'attach' // evidence file / message / note on any target
  | 'link' // relate any two items (across the return, years, related returns)
  | 'time'
  | 'view_sensitive'
  | 'disposition' // how a document was accounted for
  | 'household_fix' // corrected client-entered household data (e.g. a dependent SSN)
  | 'standards' // firm administrator changes standards
  | 'filing' // extension, approval, e-file submission/ack, freeze, amendment, notice response
  | 'undo'
  | 'seen'; // "what changed since I last looked" bookmark

export interface LEvent {
  id: string;
  /** wall-clock time the event was recorded */
  at: string;
  /** season time (replay clock) the event belongs to */
  simAt: string;
  actor: string;
  type: EventType;
  target?: string[];
  payload: any;
  /** events made together by one action share a batch id and undo together */
  batch?: string;
  serverSeq?: number;
}

export type AdjCategory = RateCat | 'payment_fed' | 'payment_ca' | 'credit_fed' | 'credit_ca' | 'manual' | 'none';

export interface AdjustPayload {
  title: string;
  target: string; // line key or ev id
  area: string;
  from: number | string;
  to: number | string;
  /** dollars of change in the category's base (sign as it affects income / deduction / payment) */
  amount: number;
  category: AdjCategory;
  /** how California is affected: residency-prorated rate, fully California-source, or not at all */
  caTreatment?: 'rate' | 'ca_source' | 'none';
  manualEffect?: { federal: number; california: number; basis: string };
  whatIf?: string;
  reason: string;
  authority?: string;
  findingId?: string;
  evidence?: string[];
}

export const VERIFY_LABELS: Record<string, string> = {
  agreed_to_source_document: 'Agreed to source document',
  recalculated: 'Recalculated',
  confirmed_with_client: 'Confirmed with client',
  agreed_to_prior_year: 'Agreed to prior year',
  agreed_to_third_party_record: 'Agreed to third-party record',
};
