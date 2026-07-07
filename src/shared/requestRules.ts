/**
 * ════════════════════════════════════════════════════════════════
 * CANONICAL REQUEST BUSINESS RULES — single source of truth
 * ════════════════════════════════════════════════════════════════
 * This file must be IDENTICAL in both repositories:
 *   - geobase            → app/shared/requestRules.ts
 *   - geobase-mobile      → src/shared/requestRules.ts
 *
 * RULE: if you edit a mapping here, copy this entire file into the
 * other repo immediately. Do not edit one copy and forget the other.
 */

// ── Who can be sent (and approve) each request type ────────────────────────
// Unmapped types stay unfiltered, same convention as ASSIGNEE_ROLE_MAP.
export const RECIPIENT_ROLE_MAP: Record<string, string[]> = {
  // Finance
  "Petty Cash Request": ["CEO", "Finance Director"],
  "Vendor Payment Request": ["Finance Director", "CEO"],
  "Fund Transfer Request": ["Finance Director", "CEO"],
  "Expense Reimbursement Request": ["Finance Director"],
  "Budget Increase Request": ["Finance Director", "CEO"],
  "Project Funding Request": ["CEO", "Finance Director"],
  "Internal Audit Request": ["Auditor", "CEO"],

  // HR
  "Leave Request": ["HR Manager", "Admin"],
  "Recruitment Request": ["HR Manager", "CEO"],
  "Training Request": ["HR Manager", "Admin"],
  "Disciplinary Action Request": ["HR Manager", "CEO"],

  // Procurement
  "Purchase Order Request": ["Procurement Manager"],
  "Contract Approval Request": ["Procurement Manager", "CEO"],
  "Vendor Selection Request": ["Procurement Manager"],
  "Procurement Evaluation Request": ["Procurement Manager"],
  "Supplier Performance Review Request": ["Procurement Manager"],
  "Inventory Request": ["Procurement Manager"],
  "Procurement Request": ["Procurement Manager"],

  // Audit
  "Audit Request": ["CEO", "Finance Director", "Auditor"],

  // Quantity Surveyor
  "BOQ Submission": ["Project Manager", "Quantity Surveyor"],
  "Valuation Request": ["Project Manager", "Quantity Surveyor"],
  "Variation Order Request": ["Project Manager", "CEO"],
  "Cost Estimate Request": ["Project Manager", "Quantity Surveyor"],

  // Site/Project
  "Site Material Request": ["Project Manager", "Procurement Manager"],
  "Material Request": ["Project Manager", "Procurement Manager"],
  "Payment Request": ["Project Manager", "Finance Director"],

  // Logistics
  "Logistics Request": ["Admin", "Procurement Manager"],

  // Viewer
  "Report Access Request": ["Admin"],

  // Strategic/General — intentionally left unmapped to stay unfiltered
}

export function getRecipientPool(requestType: string, allProfiles: any[]) {
  const allowedRoles = RECIPIENT_ROLE_MAP[requestType]
  if (!allowedRoles) return allProfiles
  return allProfiles.filter(p => allowedRoles.includes(p.role?.name))
}

// ── Who can be assigned each request type, once approved ──────────────────
// Unmapped types (Strategic/General, etc.) intentionally stay unfiltered.
export const ASSIGNEE_ROLE_MAP: Record<string, string[]> = {
  // Finance
  "Petty Cash Request": ["Accountant"],
  "Vendor Payment Request": ["Finance Director", "Accountant"],
  "Fund Transfer Request": ["Finance Director", "Accountant"],
  "Expense Reimbursement Request": ["Finance Director", "Accountant"],
  "Budget Increase Request": ["Finance Director", "Accountant"],
  "Project Funding Request": ["Finance Director", "Accountant"],

  // HR
  "Leave Request": ["HR Manager", "Admin"],
  "Recruitment Request": ["HR Manager", "Admin"],
  "Training Request": ["HR Manager", "Admin"],
  "Disciplinary Action Request": ["HR Manager", "Admin"],

  // Procurement
  "Purchase Order Request": ["Procurement Manager", "Procurement Officer"],
  "Contract Approval Request": ["Procurement Manager", "Procurement Officer"],
  "Vendor Selection Request": ["Procurement Manager", "Procurement Officer"],
  "Procurement Evaluation Request": ["Procurement Manager", "Procurement Officer"],
  "Supplier Performance Review Request": ["Procurement Manager", "Procurement Officer"],
  "Inventory Request": ["Procurement Manager", "Procurement Officer"],
  "Procurement Request": ["Procurement Manager", "Procurement Officer"],

  // Audit
  "Audit Request": ["Auditor"],

  // Quantity Surveyor
  "BOQ Submission": ["Quantity Surveyor", "Project Manager"],
  "Valuation Request": ["Quantity Surveyor", "Project Manager"],
  "Variation Order Request": ["Quantity Surveyor", "Project Manager"],
  "Cost Estimate Request": ["Quantity Surveyor", "Project Manager"],

  // Site/Project
  "Site Material Request": ["Site Supervisor", "Project Manager", "Procurement Officer"],
  "Material Request": ["Site Supervisor", "Project Manager", "Procurement Officer"],
  "Payment Request": ["Site Supervisor", "Project Manager", "Procurement Officer"],

  // Logistics
  "Logistics Request": ["Admin", "Procurement Officer"],

  // Strategic/General — intentionally left unmapped to stay unfiltered
}

// ── Which request types require a completion attachment ───────────────────
export const ATTACHMENT_REQUIRED_TYPES = new Set([
  "Leave Request", "Vendor Payment Request", "Petty Cash Request", "Fund Transfer Request",
  "Training Request", "Purchase Order Request", "Contract Approval Request",
  "Disciplinary Action Request", "BOQ Submission", "Valuation Request", "Variation Order Request",
  "Recruitment Request", "Site Material Request", "Material Request",
  "Audit Request", "Vendor Selection Request", "Supplier Performance Review Request",
  "Procurement Evaluation Request", "Budget Increase Request",
  "Project Funding Request",
])

// ── Filters the assignee pool to roles relevant to this request type ───────
// Unmapped types (e.g. General Request) return everyone — intentional.
export function getAssigneePool(requestType: string, allProfiles: any[]) {
  const allowedRoles = ASSIGNEE_ROLE_MAP[requestType]
  if (!allowedRoles) return allProfiles
  return allProfiles.filter(p => allowedRoles.includes(p.role?.name))
}

// ── Can this role self-complete this request type, or must they assign? ───
export function canRoleComplete(requestType: string, roleName?: string) {
  const allowedRoles = ASSIGNEE_ROLE_MAP[requestType]
  if (!allowedRoles) return true // unmapped types stay unrestricted
  return allowedRoles.includes(roleName ?? "")
}