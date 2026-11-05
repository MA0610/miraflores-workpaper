import type { Version } from '../data/types';
import type { AdjustPayload } from '../ledger/types';

export interface Effect { fedTax: number; caTax: number; fedPay: number; caPay: number }
export const ZERO: Effect = { fedTax: 0, caTax: 0, fedPay: 0, caPay: 0 };

/**
 * The engine cannot be rerun. Per the packet README, the effect of a change is the change times the
 * version's per-dollar rate; credits and payments are 1:1; engine what-ifs are used where they exist.
 */
export function adjEffect(a: AdjustPayload, v: Version, whatIfs: any[] = []): Effect {
  if (a.whatIf) {
    const w = whatIfs.find((x) => x.id === a.whatIf);
    if (w) return { fedTax: w.federal.total_tax_change, caTax: w.california.total_tax_change, fedPay: 0, caPay: 0 };
  }
  if (a.manualEffect) return { fedTax: a.manualEffect.federal, caTax: a.manualEffect.california, fedPay: 0, caPay: 0 };
  const amt = a.amount || 0;
  switch (a.category) {
    case 'payment_fed':
      return { ...ZERO, fedPay: amt };
    case 'payment_ca':
      return { ...ZERO, caPay: amt };
    case 'credit_fed':
      return { ...ZERO, fedTax: -amt };
    case 'credit_ca':
      return { ...ZERO, caTax: -amt };
    case 'none':
    case 'manual':
      return ZERO;
  }
  const r = v.tax_effect_rates[a.category];
  if (!r) return ZERO;
  const fed = amt * r.federal_per_dollar;
  let ca = 0;
  if (a.caTreatment === 'ca_source') ca = amt * v.tax_effect_rates.ca_source_income.california_per_dollar;
  else if (a.caTreatment !== 'none') ca = amt * r.california_per_dollar;
  return { fedTax: Math.round(fed), caTax: Math.round(ca), fedPay: 0, caPay: 0 };
}

export function sumEffects(list: Effect[]): Effect {
  return list.reduce((s, e) => ({ fedTax: s.fedTax + e.fedTax, caTax: s.caTax + e.caTax, fedPay: s.fedPay + e.fedPay, caPay: s.caPay + e.caPay }), { ...ZERO });
}

export function adjustedSummary(v: Version, e: Effect) {
  const f = v.summary.federal, c = v.summary.california;
  return {
    federal: { ...f, total_tax: f.total_tax + e.fedTax, payments: f.payments + e.fedPay, balance_due: f.balance_due + e.fedTax - e.fedPay },
    california: { ...c, total_tax: c.total_tax + e.caTax, payments: c.payments + e.caPay, balance_due: c.balance_due + e.caTax - e.caPay },
  };
}

export const biggest = (e: Effect) => Math.max(Math.abs(e.fedTax - e.fedPay), Math.abs(e.caTax - e.caPay));
