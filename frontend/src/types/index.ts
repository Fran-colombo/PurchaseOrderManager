export type Role = "normal" | "sysadmin";

export interface User {
  id: number;
  username: string;
  email: string;
  full_name: string;
  role: Role;
  is_active: boolean;
  created_at?: string;
}

export interface Page<T> {
  items: T[];
  total: number;
  page: number;
  page_size: number;
}

export interface Client {
  id: number;
  legal_name: string;
  trade_name: string;
  cuit: string | null;
  contact_name: string;
  email: string;
  phone: string;
  address: string;
  notes: string;
  status: string;
}

export interface Project {
  id: number;
  client_id: number;
  client_name: string;
  name: string;
  location: string;
  internal_code: string;
  start_date: string | null;
  estimated_end_date: string | null;
  actual_end_date: string | null;
  status: string;
  internal_owner: string;
  notes: string;
  purchase_orders?: PurchaseOrder[];
}

export interface PoItem {
  id: number;
  purchase_order_id: number;
  scope_id: number | null;
  description: string;
  sector: string;
  unit_id: number | null;
  unit_name: string;
  contracted_quantity: string;
  unit_price: string;
  original_amount: string;
  certified_quantity: string;
  pending_quantity: string;
  status: string;
  sort_order: number;
}

export interface PurchaseOrder {
  id: number;
  client_po_number: string;
  client_id: number;
  client_name: string;
  project_id: number;
  project_name: string;
  issue_date: string | null;
  acceptance_date: string | null;
  currency: string;
  payment_terms: string;
  payment_term_days: number | null;
  retention_percent: string;
  retention_base_type: string;
  retention_concepts: string[];
  release_trigger: string;
  release_days: number;
  contractual_start_date: string | null;
  explicit_release_date: string | null;
  release_scope_id: number | null;
  status: string;
  notes: string;
  contracted_amount: string;
  items?: PoItem[];
  scopes?: { id: number; name: string; description: string }[];
}

export interface CertificateItem {
  id: number;
  po_item_id: number;
  description: string;
  quantity: string;
  accumulated_quantity: string;
  unit_price: string;
  base_amount: string;
  adjustment_amount: string;
  adjusted_amount: string;
  calculation_method: string;
  coefficient: string | null;
  overage_authorized: boolean;
  overage_reason: string;
  notes: string;
}

export interface Adjustment {
  id: number;
  certificate_id: number | null;
  certificate_item_id: number | null;
  purchase_order_id: number;
  project_id: number;
  kind: string;
  method: string;
  base_period_year: number | null;
  base_period_month: number | null;
  update_period_year: number | null;
  update_period_month: number | null;
  formula_text: string;
  coefficient: string | null;
  adjustable_base: string;
  updated_amount: string;
  adjustment_amount: string;
  presented_amount: string | null;
  approved_amount: string | null;
  status: string;
  notes: string;
  void_reason: string;
  official: boolean;
  created_at: string;
}

export interface Retention {
  id: number;
  certificate_id: number;
  certificate_number: string;
  purchase_order_id: number;
  purchase_order_number: string;
  project_id: number;
  project_name: string;
  client_id: number;
  client_name: string;
  currency: string;
  calculation_base: string;
  base_breakdown: Record<string, string>;
  percent: string;
  retained_amount: string;
  recovered_amount: string;
  pending_amount: string;
  retention_date: string | null;
  release_trigger: string;
  release_days: number;
  completion_date: string | null;
  contractual_start_date: string | null;
  explicit_release_date: string | null;
  expected_release_date: string | null;
  claim_enabled_date: string | null;
  status: string;
  disputed: boolean;
  last_claim_date: string | null;
  next_followup_date: string | null;
  formula: string;
  notes: string;
  is_claimable: boolean;
  is_overdue: boolean;
  is_upcoming_30: boolean;
  is_upcoming_7: boolean;
  missing_release_date: boolean;
  claims?: Claim[];
}

export interface Certificate {
  id: number;
  client_number: string;
  purchase_order_id: number;
  purchase_order_number: string;
  project_id: number;
  project_name: string;
  client_id: number | null;
  client_name: string;
  document_type: string;
  issue_date: string | null;
  period_from: string | null;
  period_to: string | null;
  received_date: string | null;
  approved_date: string | null;
  invoiced_date: string | null;
  invoice_number: string;
  payment_due_date: string | null;
  status: string;
  currency: string;
  base_amount: string;
  cac_amount: string;
  cac_approved_amount: string;
  other_additions: string;
  gross_amount: string;
  retention_base_amount: string;
  retention_amount: string;
  other_deductions: string;
  net_amount: string;
  collected_amount: string;
  pending_amount: string;
  retention_percent_snapshot: string;
  retention_base_type_snapshot: string;
  retention_formula: string;
  notes: string;
  void_reason: string;
  items?: CertificateItem[];
  adjustments?: Adjustment[];
  retention?: Retention | null;
  payments?: {
    id: number;
    payment_id: number;
    amount: string;
    concept: string;
    payment_date: string | null;
    reference: string;
    payment_status: string;
  }[];
}

export interface CacIndex {
  id: number;
  period_year: number;
  period_month: number;
  series_code: string;
  series_name: string;
  published_value: string;
  publication_date: string | null;
  source: string;
  source_url: string;
  notes: string;
}

export interface Payment {
  id: number;
  client_id: number;
  payment_date: string;
  total_amount: string;
  applied_amount: string;
  unapplied_amount: string;
  currency: string;
  method: string;
  reference: string;
  notes: string;
  status: string;
  void_reason: string;
  applications?: {
    id: number;
    certificate_id: number | null;
    retention_id: number | null;
    concept: string;
    amount: string;
    notes: string;
  }[];
}

export interface Claim {
  id: number;
  client_id: number;
  project_id: number | null;
  purchase_order_id: number | null;
  claim_date: string;
  channel: string;
  recipient: string;
  internal_owner: string;
  response: string;
  promised_payment_date: string | null;
  next_followup_date: string | null;
  status: string;
  amount_claimed: string;
  currency: string;
  notes: string;
  void_reason: string;
  retention_ids: number[];
  events?: { id: number; event_date: string; event_type: string; description: string }[];
}

export interface Reminder {
  id: number;
  title: string;
  detail: string;
  due_date: string | null;
  amount: string;
  currency: string;
  priority: string;
  status: string;
  link_path: string;
  created_at: string;
  contact?: ClientContact | null;
}

export interface ClientContact {
  client_id: number | null;
  client_name: string;
  contact_name: string;
  email: string;
  phone: string;
  subject: string;
  message: string;
  whatsapp_url: string;
  mailto_url: string;
}

export interface Alert {
  priority: string;
  kind: string;
  title: string;
  date: string | null;
  amount: string | null;
  currency: string;
  path: string;
}

export interface Dashboard {
  company_name: string;
  generated_on: string;
  definitions: Record<string, string>;
  currencies: string[];
  by_currency: Record<string, Record<string, string>>;
  counts: Record<string, number>;
  alerts: Alert[];
  charts: Record<
    string,
    {
      monthly_certificates: { month: string; amount: string }[];
      monthly_collections: { month: string; amount: string }[];
      monthly_retentions: { month: string; amount: string }[];
      upcoming_releases: { date: string; amount: string; label: string; path: string }[];
      balances_by_client: { id: number; name: string; amount: string }[];
      balances_by_project: { id: number; name: string; amount: string }[];
    }
  >;
  reminders: Reminder[];
}

export interface Option {
  value: string;
  label: string;
}

export interface Meta {
  email_enabled?: boolean;
  email_auto_send?: boolean;
  currencies: string[];
  retention_bases: Option[];
  retention_concepts: Option[];
  release_triggers: Option[];
  certificate_statuses: string[];
  project_statuses: string[];
  adjustment_statuses: string[];
  claim_statuses: string[];
  channels: string[];
  payment_methods?: string[];
  payment_concepts: Option[];
}
