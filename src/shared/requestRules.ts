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

export const ASSIGNEE_ROLE_MAP: Record<string, string[]> = {
  // Finance
  "Petty Cash Request": ["Finance Director", "Accountant"],
  "Vendor Payment Request": ["Finance Director", "Accountant"],
  "Fund Transfer Request": ["Finance Director", "Accountant"],
  "Expense Reimbursement Request": ["Finance Director", "Accountant"],
  "Budget Increase Request": ["Finance Director", "Accountant"],
  "Project Funding Request": ["Finance Director", "Accountant"],
  "Financial Report Submission": ["Finance Director", "Accountant"],
  "Budget Approval": ["Finance Director", "Accountant"],

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
  "Procurement Report Submission": ["Procurement Manager", "Procurement Officer"],
  "Inventory Request": ["Procurement Manager", "Procurement Officer"],
  "Procurement Request": ["Procurement Manager", "Procurement Officer"],

  // Audit
  "Audit Request": ["Auditor"],
  "Compliance Review": ["Auditor"],
  "Financial Review": ["Auditor"],
  "Operational Review": ["Auditor"],
  "Risk Assessment": ["Auditor"],
  "Internal Control Evaluation": ["Auditor"],
  "Fraud Investigation": ["Auditor"],
  "Regulatory Compliance Request": ["Auditor"],
  "Internal Audit Request": ["Auditor"],

  // Quantity Surveyor
  "BOQ Submission": ["Quantity Surveyor", "Project Manager"],
  "Valuation Request": ["Quantity Surveyor", "Project Manager"],
  "Variation Order Request": ["Quantity Surveyor", "Project Manager"],
  "Cost Estimate Request": ["Quantity Surveyor", "Project Manager"],

  // Site/Project
  "Site Material Request": ["Site Supervisor", "Project Manager", "Procurement Officer"],
  "Material Request": ["Site Supervisor", "Project Manager", "Procurement Officer"],
  "Incident Report Request": ["Site Supervisor", "Project Manager", "Procurement Officer"],
  "Payment Request": ["Site Supervisor", "Project Manager", "Procurement Officer"],

  // Logistics
  "Logistics Request": ["Admin", "Procurement Officer"],

  // Strategic/General — intentionally left unmapped to stay unfiltered
}

export const ATTACHMENT_REQUIRED_TYPES = new Set([
  "Leave Request", "Vendor Payment Request", "Petty Cash Request", "Fund Transfer Request",
  "Training Request", "Purchase Order Request", "Contract Approval Request",
  "Disciplinary Action Request", "BOQ Submission", "Valuation Request", "Variation Order Request",
  "Recruitment Request", "Site Material Request", "Material Request", "Incident Report Request",
  "Financial Report Submission", "Audit Request", "Compliance Review", "Financial Review",
  "Operational Review", "Risk Assessment", "Internal Control Evaluation", "Fraud Investigation",
  "Regulatory Compliance Request", "Vendor Selection Request", "Supplier Performance Review Request",
  "Procurement Evaluation Request", "Procurement Report Submission", "Budget Increase Request",
  "Project Funding Request",
])

export function getAssigneePool(requestType: string, allProfiles: any[]) {
  const allowedRoles = ASSIGNEE_ROLE_MAP[requestType]
  if (!allowedRoles) return allProfiles
  return allProfiles.filter(p => allowedRoles.includes(p.role?.name))
}