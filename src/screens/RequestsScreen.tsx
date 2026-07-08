import { useEffect, useState, useCallback } from 'react'
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  TextInput, ActivityIndicator,
  KeyboardAvoidingView, Platform, ScrollView, Alert, Linking,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useFocusEffect } from '@react-navigation/native'
import * as ImagePicker from 'expo-image-picker'
import * as DocumentPicker from 'expo-document-picker'
import { supabase } from '../lib/supabase'
import { ATTACHMENT_REQUIRED_TYPES, getAssigneePool, getRecipientPool, canRoleComplete } from '../shared/requestRules'

type Request = {
  id: string
  title: string
  description: string
  request_type: string
  priority: string
  status: 'pending' | 'approved' | 'rejected' | 'completed'
  created_at: string
  requested_by: string
  recipient_id: string
  assigned_to?: string
  completed_at?: string
  completed_by?: string
  completion_notes?: string
  response_attachment_url?: string
  sender_name?: string
  recipient_name?: string
  assignee_name?: string
  completed_by_name?: string
}


type Profile = {
  id: string
  full_name: string
  organization_id: string
  role_name?: string
}

const STATUS_COLOR: Record<string, string> = {
  pending: '#c9a84c',
  approved: '#4caf82',
  completed: '#64b5f6',
  rejected: '#e05c5c',
}

const PRIORITY_COLOR: Record<string, string> = {
  Low: '#4caf82',
  Medium: '#c9a84c',
  High: '#e08c3c',
  Critical: '#e05c5c',
}

const requestOptions: Record<string, string[]> = {
  CEO:                  ["General Request","Leave Request","Logistics Request"],
  Admin:                ["General Request","Petty Cash Request","Procurement Request","Leave Request","Logistics Request"],
  "Finance Director":   ["General Request","Vendor Payment Request","Fund Transfer Request","Internal Audit Request","Project Funding Request","Logistics Request"],
  "HR Manager":         ["General Request","Recruitment Request","Petty Cash Request","Training Request","Disciplinary Action Request","Leave Request","Logistics Request"],
  "Procurement Manager":["General Request","Budget Increase Request","Logistics Request"],
  "Procurement Officer":["General Request","Inventory Request","Vendor Selection Request","Logistics Request"],
  Auditor:              ["General Request","Audit Request","Logistics Request"],
  Viewer:               ["General Request","Report Access Request","Logistics Request"],
  "Quantity Surveyor":  ["General Request","BOQ Submission","Valuation Request","Variation Order Request","Cost Estimate Request","Logistics Request"],
  "Project Manager":    ["General Request","Payment Request","Site Material Request","Leave Request","Logistics Request"],
  "Site Supervisor":    ["General Request","Material Request","Leave Request","Logistics Request"],
  Accountant:           ["General Request","Petty Cash Request","Expense Reimbursement Request","Leave Request","Logistics Request"],
  default:              ["General Request","Leave Request","Petty Cash Request","Logistics Request"],
}

const LOGISTICS_TYPES = ["Vehicle Request","Accommodation Request","Fuel Request","Travel Request","Event Support Request"]
const EXPENSE_CATEGORIES = ["Travel","Meals & Entertainment","Office Supplies","Equipment","Communication","Accommodation","Medical","Training","Other"]
const AUDIT_TYPES = ["General Audit","Compliance Review","Financial Review","Operational Review","Risk Assessment","Internal Control Evaluation","Fraud Investigation","Regulatory Compliance Request"]
const DISCIPLINARY_ACTIONS = ["Verbal Warning","Written Warning","Final Warning","Suspension","Termination","Performance Improvement Plan","Demotion"]
const CONTRACT_TYPES = ["Fixed Price","Cost Reimbursable","Time & Materials","Framework Agreement","Service Level Agreement","Supply Agreement"]
const RISK_LEVELS = ["Low","Medium","High","Critical"]
// Note: Equipment Request intentionally excluded — its item-list UI stays web-only

// Mobile stores short request_type values ('Leave', 'Petty Cash', 'Material') while
// shared/requestRules.ts (and web) key on the full names ('Leave Request', etc).
// Translate here at the call site only — this does not change what's stored or displayed.
const MOBILE_TO_SHARED_TYPE: Record<string, string> = {
  Leave: 'Leave Request',
  'Petty Cash': 'Petty Cash Request',
  Material: 'Material Request',
}
function toSharedType(requestType: string) {
  return MOBILE_TO_SHARED_TYPE[requestType] ?? requestType
}

function buildRequestExtras(requestType: string, s: any) {
  let start_date: string | null = null
  let end_date: string | null = null
  let amount: number | null = null
  let details: Record<string, any> = {}

  switch (requestType) {
    case 'Leave Request':
      start_date = s.leaveFrom || null
      end_date = s.leaveTo || null
      break

    case 'Petty Cash Request':
      amount = s.amount ? Number(s.amount) : null
      details = { category: s.pettyCashCategory, projectId: s.pettyCashCategory === 'Project' ? (s.projectId || null) : null, purpose: s.pettyCashPurpose || null }
      break

    case 'Vendor Payment Request':
      amount = s.amount ? Number(s.amount) : null
      details = { vendorName: s.vendorName, invoiceNo: s.invoiceNo, projectId: s.projectId, vendorBank: s.vendorBank, vendorAccNo: s.vendorAccNo, vendorBranch: s.vendorBranch }
      break

    case 'Fund Transfer Request':
      amount = s.amount ? Number(s.amount) : null
      details = { fromAccount: s.fromAccount, toAccount: s.toAccount, projectId: s.projectId, transferPurpose: s.transferPurpose }
      break

    case 'Expense Reimbursement Request':
      amount = s.amount ? Number(s.amount) : null
      start_date = s.expDate || null
      details = { category: s.expCategory, receiptRef: s.receiptRef }
      break

    case 'Internal Audit Request':
      start_date = s.auditPeriodFrom || null
      end_date = s.auditPeriodTo || null
      details = { auditType: s.auditType, projectId: s.projectId, scope: s.auditScope }
      break

    case 'Project Funding Request':
      amount = s.amount ? Number(s.amount) : null
      details = { projectId: s.projectId, timeline: s.fundingTimeline, justification: s.fundingJustification }
      break

    case 'Recruitment Request':
      end_date = s.recruitDueDate || null
      details = { position: s.recruitPosition, department: s.recruitDept, vacancies: s.recruitVacancies, qualifications: s.recruitQual }
      break

    case 'Training Request':
      start_date = s.trainDate || null
      amount = s.trainCost ? Number(s.trainCost) : null
      details = { type: s.trainType, provider: s.trainProvider, duration: s.trainDuration, staffCount: s.trainStaff }
      break

    case 'Disciplinary Action Request':
      start_date = s.discIncidentDate || null
      details = { employeeId: s.discEmployee, actionType: s.discActionType, description: s.discDesc, witnesses: s.discWitnesses }
      break

    case 'Contract Approval Request':
      amount = s.contractValue ? Number(s.contractValue) : null
      start_date = s.contractStartDate || null
      details = { vendor: s.contractVendor, type: s.contractType, duration: s.contractDuration, terms: s.contractTerms, projectId: s.projectId }
      break

    case 'Budget Increase Request':
      amount = s.budgetRequested ? Number(s.budgetRequested) : null
      details = { projectId: s.projectId, currentBudget: s.budgetCurrent, requestedIncrease: s.budgetRequested, justification: s.budgetJustify }
      break

    case 'Vendor Selection Request':
      amount = s.procCost ? Number(s.procCost) : null
      end_date = s.vendorSelDeadline || null
      details = { item: s.vendorSelItem, requirements: s.vendorSelReqs, projectId: s.projectId }
      break
      case 'Supplier Performance Review Request':
      start_date = s.supplierPeriodFrom || null
      end_date = s.supplierPeriodTo || null
      details = { supplier: s.supplierName, kpis: s.supplierKPIs, projectId: s.projectId }
      break

    case 'Audit Request': {
      start_date = s.auditPeriodFrom || null
      end_date = s.auditPeriodTo || null
      details = { auditSubType: s.auditSubType, projectId: s.projectId, scope: s.auditScope }

      if (s.auditSubType === 'Compliance Review' || s.auditSubType === 'Regulatory Compliance Request') {
        details = { ...details, complianceArea: s.complianceArea, regulations: s.complianceRegs }
      } else if (s.auditSubType === 'Financial Review' || s.auditSubType === 'Operational Review') {
        details = { ...details, departments: s.reviewDepts }
      } else if (s.auditSubType === 'Internal Control Evaluation') {
        details = { ...details, controlArea: s.controlArea }
      } else if (s.auditSubType === 'Risk Assessment') {
        details = { ...details, riskArea: s.riskArea, likelihood: s.riskLikelihood, impact: s.riskImpact, mitigation: s.riskMitigation }
      } else if (s.auditSubType === 'Fraud Investigation') {
        start_date = s.fraudIncidentDate || start_date
        details = { ...details, parties: s.fraudParties, evidence: s.fraudEvidence }
      }
      break
    }
    case 'Logistics Request':
      details = { logisticsType: s.logisticsType }
      if (s.logisticsType === 'Vehicle Request') {
        start_date = s.vehDate || null
        details = { ...details, passengers: s.vehPassengers, destination: s.vehDest, purpose: s.vehPurpose }
      } else if (s.logisticsType === 'Accommodation Request') {
        start_date = s.accCheckIn || null
        end_date = s.accCheckOut || null
        details = { ...details, guests: s.accGuests, location: s.accLocation }
      } else if (s.logisticsType === 'Fuel Request') {
        details = { ...details, vehicle: s.fuelVehicle, quantity: s.fuelQty, purpose: s.fuelPurpose }
      } else if (s.logisticsType === 'Travel Request') {
        start_date = s.travelFrom || null
        end_date = s.travelTo || null
        details = { ...details, destination: s.travelDest, purpose: s.travelPurpose }
      } else if (s.logisticsType === 'Event Support Request') {
        start_date = s.eventDate || null
        details = { ...details, eventName: s.eventName, participants: s.eventPax, requirements: s.eventReqs }
      }
      break

    default:
      break
  }

  return { start_date, end_date, amount, details: Object.keys(details).length > 0 ? details : null }
}

export default function RequestsScreen({ route, navigation }: any) {
  const [tab, setTab] = useState<'mine' | 'inbox' | 'complete'>('mine')
  const [filter, setFilter] = useState<'all' | 'pending' | 'approved' | 'completed' | 'rejected'>('all')
  const [requests, setRequests] = useState<Request[]>([])
  const [loading, setLoading] = useState(true)
  const [modalVisible, setModalVisible] = useState(false)
  const [detailRequest, setDetailRequest] = useState<Request | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [orgProfiles, setOrgProfiles] = useState<Profile[]>([])
  const [projects, setProjects] = useState<{ id: string; name: string }[]>([])
  const [projectId, setProjectId] = useState('')
  const [pettyCashPurpose, setPettyCashPurpose] = useState('')
  const [pettyCashCategory, setPettyCashCategory] = useState('Project')
  const [showProjectPicker, setShowProjectPicker] = useState(false)

  // ── Finance fields ──
  const [vendorName, setVendorName] = useState('')
  const [vendorBank, setVendorBank] = useState('')
  const [vendorAccNo, setVendorAccNo] = useState('')
  const [vendorBranch, setVendorBranch] = useState('')
  const [invoiceNo, setInvoiceNo] = useState('')
  const [fromAccount, setFromAccount] = useState('')
  const [toAccount, setToAccount] = useState('')
  const [transferPurpose, setTransferPurpose] = useState('')
  const [expDate, setExpDate] = useState('')
  const [expCategory, setExpCategory] = useState('')
  const [showExpCategoryPicker, setShowExpCategoryPicker] = useState(false)
  const [receiptRef, setReceiptRef] = useState('')
  const [auditType, setAuditType] = useState('')
  const [showAuditTypePicker, setShowAuditTypePicker] = useState(false)
  const [auditPeriodFrom, setAuditPeriodFrom] = useState('')
  const [auditPeriodTo, setAuditPeriodTo] = useState('')
  const [auditScope, setAuditScope] = useState('')
  const [fundingTimeline, setFundingTimeline] = useState('')
  const [fundingJustification, setFundingJustification] = useState('')

  // ── HR fields ──
  const [recruitPosition, setRecruitPosition] = useState('')
  const [recruitDept, setRecruitDept] = useState('')
  const [recruitVacancies, setRecruitVacancies] = useState('')
  const [recruitQual, setRecruitQual] = useState('')
  const [recruitDueDate, setRecruitDueDate] = useState('')
  const [trainType, setTrainType] = useState('')
  const [trainProvider, setTrainProvider] = useState('')
  const [trainDuration, setTrainDuration] = useState('')
  const [trainStaff, setTrainStaff] = useState('')
  const [trainCost, setTrainCost] = useState('')
  const [trainDate, setTrainDate] = useState('')
  const [discEmployee, setDiscEmployee] = useState('')
  const [showDiscEmployeePicker, setShowDiscEmployeePicker] = useState(false)
  const [discIncidentDate, setDiscIncidentDate] = useState('')
  const [discActionType, setDiscActionType] = useState('')
  const [showDiscActionPicker, setShowDiscActionPicker] = useState(false)
  const [discDesc, setDiscDesc] = useState('')
  const [discWitnesses, setDiscWitnesses] = useState('')

  // ── Procurement fields ──
  const [contractVendor, setContractVendor] = useState('')
  const [contractType, setContractType] = useState('')
  const [showContractTypePicker, setShowContractTypePicker] = useState(false)
  const [contractValue, setContractValue] = useState('')
  const [contractDuration, setContractDuration] = useState('')
  const [contractStartDate, setContractStartDate] = useState('')
  const [contractTerms, setContractTerms] = useState('')
  const [budgetCurrent, setBudgetCurrent] = useState('')
  const [budgetRequested, setBudgetRequested] = useState('')
  const [budgetJustify, setBudgetJustify] = useState('')
  const [vendorSelItem, setVendorSelItem] = useState('')
  const [vendorSelReqs, setVendorSelReqs] = useState('')
  const [vendorSelDeadline, setVendorSelDeadline] = useState('')
  const [procCost, setProcCost] = useState('')
  const [supplierName, setSupplierName] = useState('')
  const [supplierPeriodFrom, setSupplierPeriodFrom] = useState('')
  const [supplierPeriodTo, setSupplierPeriodTo] = useState('')
  const [supplierKPIs, setSupplierKPIs] = useState('')

  // ── Audit Request fields ──
  const [auditSubType, setAuditSubType] = useState('')
  const [showAuditSubTypePicker, setShowAuditSubTypePicker] = useState(false)
  const [complianceArea, setComplianceArea] = useState('')
  const [complianceRegs, setComplianceRegs] = useState('')
  const [reviewDepts, setReviewDepts] = useState('')
  const [controlArea, setControlArea] = useState('')
  const [riskArea, setRiskArea] = useState('')
  const [riskLikelihood, setRiskLikelihood] = useState('Medium')
  const [riskImpact, setRiskImpact] = useState('Medium')
  const [riskMitigation, setRiskMitigation] = useState('')
  const [fraudParties, setFraudParties] = useState('')
  const [fraudEvidence, setFraudEvidence] = useState('')
  const [fraudIncidentDate, setFraudIncidentDate] = useState('')

  // ── Logistics fields ──
  const [vehPassengers, setVehPassengers] = useState('')
  const [vehDate, setVehDate] = useState('')
  const [vehDest, setVehDest] = useState('')
  const [vehPurpose, setVehPurpose] = useState('')
  const [accCheckIn, setAccCheckIn] = useState('')
  const [accCheckOut, setAccCheckOut] = useState('')
  const [accGuests, setAccGuests] = useState('')
  const [accLocation, setAccLocation] = useState('')
  const [fuelVehicle, setFuelVehicle] = useState('')
  const [fuelQty, setFuelQty] = useState('')
  const [fuelPurpose, setFuelPurpose] = useState('')
  const [travelFrom, setTravelFrom] = useState('')
  const [travelTo, setTravelTo] = useState('')
  const [travelDest, setTravelDest] = useState('')
  const [travelPurpose, setTravelPurpose] = useState('')
  const [eventName, setEventName] = useState('')
  const [eventDate, setEventDate] = useState('')
  const [eventPax, setEventPax] = useState('')
  const [eventReqs, setEventReqs] = useState('')


  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [requestType, setRequestType] = useState('General Request')
  const [logisticsType, setLogisticsType] = useState('')
  const [priority, setPriority] = useState('Medium')
  const [recipientId, setRecipientId] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [showRecipientPicker, setShowRecipientPicker] = useState(false)
  const [responseMsg, setResponseMsg] = useState('')
  const [leaveFrom, setLeaveFrom] = useState('')
  const [leaveTo, setLeaveTo] = useState('')
  const [amount, setAmount] = useState('')
  const [completionMode, setCompletionMode] = useState<'self' | 'assign'>('self')
  const [assigneeId, setAssigneeId] = useState('')
  const [showAssigneePicker, setShowAssigneePicker] = useState(false)
  const [completionNotes, setCompletionNotes] = useState('')
  const [completing, setCompleting] = useState(false)
  const [completionFile, setCompletionFile] = useState<{ uri: string; name: string; mimeType: string } | null>(null)
  const [uploadingCompletionFile, setUploadingCompletionFile] = useState(false)
  const [showAttachOptions, setShowAttachOptions] = useState(false)


  const loadData = async () => {
    try {
      setLoading(true)
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const { data: prof } = await supabase
        .from('profiles')
        .select('*, roles(name)')
        .eq('id', user.id)
        .single()
      const myProfile = { ...prof, role_name: prof?.roles?.name ?? '' }
      setProfile(myProfile)

      const { data: profileList } = await supabase
        .from('profiles')
        .select('id, full_name, organization_id, roles(name)')
        .eq('organization_id', myProfile.organization_id)
        .neq('id', user.id)
      setOrgProfiles((profileList ?? []).map((p: any) => ({ ...p, role_name: p.roles?.name ?? '' })))

      const { data: projectList } = await supabase
        .from('projects')
        .select('id, name')
        .eq('organization_id', myProfile.organization_id)
        .order('name')
      setProjects(projectList ?? [])

      const { data: reqData } = await supabase
        .from('requests')
        .select('*')
        .eq('organization_id', myProfile.organization_id)
        .order('created_at', { ascending: false })

      if (reqData && reqData.length > 0) {
        const ids = [...new Set([
          ...reqData.map((r: any) => r.requested_by).filter(Boolean),
          ...reqData.map((r: any) => r.recipient_id).filter(Boolean),
          ...reqData.map((r: any) => r.assigned_to).filter(Boolean),
          ...reqData.map((r: any) => r.completed_by).filter(Boolean),
        ])]
        const { data: names } = await supabase
          .from('profiles')
          .select('id, full_name')
          .in('id', ids)
        const nameMap: Record<string, string> = {}
        names?.forEach((p: any) => { nameMap[p.id] = p.full_name })
        setRequests(reqData.map((r: any) => ({
          ...r,
          sender_name: nameMap[r.requested_by] ?? '—',
          recipient_name: nameMap[r.recipient_id] ?? '—',
          assignee_name: r.assigned_to ? (nameMap[r.assigned_to] ?? '—') : undefined,
          completed_by_name: r.completed_by ? (nameMap[r.completed_by] ?? '—') : undefined,
        })))
      } else {
        setRequests([])
      }
    } catch (e) {
      Alert.alert('Error', 'Failed to load requests')
    } finally {
      setLoading(false)
    }
  }

  useFocusEffect(useCallback(() => { loadData() }, []))

  const resetForm = () => {
    setTitle(''); setDescription(''); setRequestType('General Request')
    setPriority('Medium'); setRecipientId(''); setShowRecipientPicker(false)
    setLeaveFrom(''); setLeaveTo(''); setAmount('')
    setProjectId(''); setPettyCashPurpose(''); setPettyCashCategory('Project'); setShowProjectPicker(false)
    setLogisticsType('')
    setVendorName(''); setVendorBank(''); setVendorAccNo(''); setVendorBranch(''); setInvoiceNo('')
    setFromAccount(''); setToAccount(''); setTransferPurpose('')
    setExpDate(''); setExpCategory(''); setReceiptRef('')
    setAuditType(''); setAuditPeriodFrom(''); setAuditPeriodTo(''); setAuditScope('')
    setFundingTimeline(''); setFundingJustification('')
    setRecruitPosition(''); setRecruitDept(''); setRecruitVacancies(''); setRecruitQual(''); setRecruitDueDate('')
    setTrainType(''); setTrainProvider(''); setTrainDuration(''); setTrainStaff(''); setTrainCost(''); setTrainDate('')
    setDiscEmployee(''); setDiscIncidentDate(''); setDiscActionType(''); setDiscDesc(''); setDiscWitnesses('')
    setContractVendor(''); setContractType(''); setContractValue(''); setContractDuration(''); setContractStartDate(''); setContractTerms('')
    setBudgetCurrent(''); setBudgetRequested(''); setBudgetJustify('')
    setVendorSelItem(''); setVendorSelReqs(''); setVendorSelDeadline(''); setProcCost('')
    setSupplierName(''); setSupplierPeriodFrom(''); setSupplierPeriodTo(''); setSupplierKPIs('')
    setAuditSubType(''); setComplianceArea(''); setComplianceRegs(''); setReviewDepts(''); setControlArea('')
    setRiskArea(''); setRiskLikelihood('Medium'); setRiskImpact('Medium'); setRiskMitigation('')
    setFraudParties(''); setFraudEvidence(''); setFraudIncidentDate('')
    setVehPassengers(''); setVehDate(''); setVehDest(''); setVehPurpose('')
    setAccCheckIn(''); setAccCheckOut(''); setAccGuests(''); setAccLocation('')
    setFuelVehicle(''); setFuelQty(''); setFuelPurpose('')
    setTravelFrom(''); setTravelTo(''); setTravelDest(''); setTravelPurpose('')
    setEventName(''); setEventDate(''); setEventPax(''); setEventReqs('')
  }

  const submitRequest = async () => {
    if (!title.trim()) return Alert.alert('Required', 'Please enter a title')
    if (!description.trim()) return Alert.alert('Required', 'Please enter a description')
    if (!recipientId) return Alert.alert('Required', 'Please select a recipient')
    if (requestType === 'Leave Request' && (!leaveFrom || !leaveTo)) {
      return Alert.alert('Required', 'Please enter both start and end dates')
    }
    
    if (requestType === 'Petty Cash Request' && pettyCashCategory === 'Project' && !projectId) {
      return Alert.alert('Required', 'Please select a project')
    }
    if (requestType === 'Petty Cash Request' && !pettyCashPurpose.trim()) {
      return Alert.alert('Required', 'Please enter a purpose')
    }
    if (requestType === 'Vendor Payment Request' && !vendorName.trim()) {
      return Alert.alert('Required', 'Please enter the vendor / payee name')
    }
    if (requestType === 'Project Funding Request' && !projectId) {
      return Alert.alert('Required', 'Please select a project')
    }
    if (requestType === 'Recruitment Request' && !recruitPosition.trim()) {
      return Alert.alert('Required', 'Please enter the position title')
    }
    if (requestType === 'Disciplinary Action Request' && (!discEmployee || !discActionType)) {
      return Alert.alert('Required', 'Please select an employee and action type')
    }
    if (requestType === 'Contract Approval Request' && !contractVendor.trim()) {
      return Alert.alert('Required', 'Please enter the vendor / contractor name')
    }
    if (requestType === 'Budget Increase Request' && !projectId) {
      return Alert.alert('Required', 'Please select a project')
    }
    if (requestType === 'Vendor Selection Request' && !vendorSelItem.trim()) {
      return Alert.alert('Required', 'Please describe the item / service required')
    }
    if (requestType === 'Supplier Performance Review Request' && !supplierName.trim()) {
      return Alert.alert('Required', 'Please enter the supplier name')
    }
    if (requestType === 'Audit Request' && !auditSubType) {
      return Alert.alert('Required', 'Please select an audit sub-type')
    }
    if (requestType === 'Logistics Request' && !logisticsType) {
      return Alert.alert('Required', 'Please select a logistics type')
    }

    try {
      setSubmitting(true)
      const { data: { user } } = await supabase.auth.getUser()

    const extras = buildRequestExtras(requestType, { 
      leaveFrom, leaveTo, amount, projectId, pettyCashPurpose, pettyCashCategory,
        vendorName, invoiceNo, vendorBank, vendorAccNo, vendorBranch,
        fromAccount, toAccount, transferPurpose,
        expDate, expCategory, receiptRef,
        auditType, auditPeriodFrom, auditPeriodTo, auditScope,
        fundingTimeline, fundingJustification,
        recruitPosition, recruitDept, recruitVacancies, recruitQual, recruitDueDate,
        trainType, trainProvider, trainDuration, trainStaff, trainCost, trainDate,
       discEmployee, discIncidentDate, discActionType, discDesc, discWitnesses,
        contractVendor, contractType, contractValue, contractDuration, contractStartDate, contractTerms,
        budgetCurrent, budgetRequested, budgetJustify,
        vendorSelItem, vendorSelReqs, vendorSelDeadline, procCost,
        supplierName, supplierPeriodFrom, supplierPeriodTo, supplierKPIs,
        auditSubType, complianceArea, complianceRegs, reviewDepts, controlArea,
        riskArea, riskLikelihood, riskImpact, riskMitigation,
        fraudParties, fraudEvidence, fraudIncidentDate,
        logisticsType, vehPassengers, vehDate, vehDest, vehPurpose,
        accCheckIn, accCheckOut, accGuests, accLocation,
        fuelVehicle, fuelQty, fuelPurpose,
        travelFrom, travelTo, travelDest, travelPurpose,
        eventName, eventDate, eventPax, eventReqs,
      })

      const { data: newRequest, error } = await supabase
        .from('requests')
        .insert({
          title: title.trim(),
          description: description.trim(),
          request_type: requestType,
          amount: extras.amount,
          start_date: extras.start_date,
          end_date: extras.end_date,
          details: extras.details,
          priority,
          status: 'pending',
          requested_by: user!.id,
          recipient_id: recipientId,
          organization_id: profile!.organization_id,
        })
        .select()
        .single()

      if (error) throw error

      await supabase.from('notifications').insert({
        title: 'New Request',
        message: `${profile!.full_name ?? 'Someone'} sent you a request: "${title.trim()}"`,
        recipient_id: recipientId,
        requested_by: user!.id,
        request_id: newRequest?.id,
        is_read: false,
      })

      resetForm()
      setModalVisible(false)
      await loadData()
    } catch (e: any) {
      Alert.alert('Error', e.message ?? 'Failed to submit')
    } finally {
      setSubmitting(false)
    }
  }


 const handleReject = async () => {
    if (!detailRequest) return
    try {
      const nowIso = new Date().toISOString()
      const { data: { user } } = await supabase.auth.getUser()
      const { error } = await supabase.from('requests').update({
        status: 'rejected',
        response_message: responseMsg.trim(),
        rejected_at: nowIso,
        responded_at: nowIso,
      }).eq('id', detailRequest.id)

      if (error) throw error

      await supabase.from('notifications').insert({
        recipient_id: detailRequest.requested_by,
        title: 'Request Rejected',
        message: `Your request "${detailRequest.title}" has been rejected.`,
        is_read: false, requested_by: user!.id, request_id: detailRequest.id,
      })

      setDetailRequest(null)
      setResponseMsg('')
      await loadData()
    } catch (e: any) {
      Alert.alert('Error', e.message ?? 'Failed to reject request')
    }
  }

  const handleApprove = async () => {
    if (!detailRequest) return
    const canSelfComplete = canRoleComplete(toSharedType(detailRequest.request_type), profile?.role_name)
    const finalMode = canSelfComplete ? completionMode : 'assign'
    if (finalMode === 'assign' && !assigneeId) {
      Alert.alert('Required', 'Please select someone to complete this request')
      return
    }
    try {
      const { data: { user } } = await supabase.auth.getUser()
      const finalAssignee = finalMode === 'self' ? user!.id : assigneeId
      const nowIso = new Date().toISOString()

      const { error } = await supabase.from('requests').update({
        status: 'approved',
        response_message: responseMsg.trim(),
        approved_by: user!.id,
        approved_at: nowIso,
        responded_at: nowIso,
        assigned_to: finalAssignee,
      }).eq('id', detailRequest.id)

      if (error) throw error

      const notifications = [{
        recipient_id: detailRequest.requested_by,
        title: 'Request Approved',
        message: `Your request "${detailRequest.title}" has been approved.`,
        is_read: false, requested_by: user!.id, request_id: detailRequest.id,
      }]

      if (finalAssignee !== user!.id) {
        notifications.push({
          recipient_id: finalAssignee,
          title: 'Request Assigned to You',
          message: `You've been assigned to complete: "${detailRequest.title}"`,
          is_read: false, requested_by: user!.id, request_id: detailRequest.id,
        })
      }

      await supabase.from('notifications').insert(notifications)

      setDetailRequest(null)
      setResponseMsg('')
      setCompletionMode('self')
      setAssigneeId('')
      await loadData()
    } catch (e: any) {
      Alert.alert('Error', e.message ?? 'Failed to approve request')
    }
  }

  const pickCompletionPhoto = async () => {
    setShowAttachOptions(false)
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync()
    if (!permission.granted) {
      Alert.alert('Permission needed', 'Please allow access to your photo library')
      return
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsMultipleSelection: false,
      quality: 0.7,
    })

    if (result.canceled || !result.assets?.[0]) return
    const asset = result.assets[0]
    const ext = asset.uri.split('.').pop() ?? 'jpg'
    setCompletionFile({
      uri: asset.uri,
      name: `photo-${Date.now()}.${ext}`,
      mimeType: asset.mimeType ?? `image/${ext}`,
    })
  }

  const pickCompletionDocument = async () => {
    setShowAttachOptions(false)
    const result = await DocumentPicker.getDocumentAsync({
      type: ['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'image/*'],
      copyToCacheDirectory: true,
    })

    if (result.canceled || !result.assets?.[0]) return
    const asset = result.assets[0]
    setCompletionFile({
      uri: asset.uri,
      name: asset.name,
      mimeType: asset.mimeType ?? 'application/octet-stream',
    })
  }

  const handleComplete = async () => {
    if (!detailRequest) return
    const attachmentRequired = ATTACHMENT_REQUIRED_TYPES.has(toSharedType(detailRequest.request_type))

    if (attachmentRequired && !completionFile) {
      Alert.alert('Attachment Required', `${detailRequest.request_type} requests require a document before marking as completed.`)
      return
    }

    setCompleting(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      let attachmentUrl: string | null = null

      if (completionFile) {
        setUploadingCompletionFile(true)
        const ext = completionFile.name.split('.').pop() ?? 'dat'
        const fileName = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`
        const formData = new FormData()
        formData.append('file', {
          uri: completionFile.uri,
          name: fileName,
          type: completionFile.mimeType,
        } as any)

        const { data, error: uploadError } = await supabase.storage
          .from('attachments')
          .upload(`completions/${fileName}`, formData, { contentType: 'multipart/form-data' })

        setUploadingCompletionFile(false)

        if (uploadError) throw uploadError
        if (data) {
          const { data: urlData } = supabase.storage.from('attachments').getPublicUrl(data.path)
          attachmentUrl = urlData.publicUrl
        }
      }

      const nowIso = new Date().toISOString()
      const { error } = await supabase.from('requests').update({
        status: 'completed',
        completed_by: user!.id,
        completed_at: nowIso,
        completion_notes: completionNotes.trim() || null,
        response_attachment_url: attachmentUrl,
      }).eq('id', detailRequest.id)

      if (error) throw error

      const recipients = [...new Set([detailRequest.requested_by, detailRequest.recipient_id])]
        .filter(id => id && id !== user!.id)

      if (recipients.length > 0) {
        await supabase.from('notifications').insert(
          recipients.map(rid => ({
            recipient_id: rid,
            title: 'Request Completed',
            message: `"${detailRequest.title}" has been marked as completed.`,
            is_read: false, requested_by: user!.id, request_id: detailRequest.id,
          }))
        )
      }

      setDetailRequest(null)
      setCompletionNotes('')
      setCompletionFile(null)
      await loadData()
    } catch (e: any) {
      Alert.alert('Error', e.message ?? 'Failed to mark as completed')
    } finally {
      setCompleting(false)
    }
  }

  useEffect(() => {
    const targetId = route?.params?.openRequestId
    if (!targetId) return
    const found = requests.find(r => r.id === targetId)
    if (found) {
      setDetailRequest(found)
      navigation.setParams({ openRequestId: undefined })
    }
  }, [route?.params?.openRequestId, requests])

  const myRequests = requests.filter(r => r.requested_by === profile?.id)
  const inbox = requests.filter(r => r.recipient_id === profile?.id)
  const toCompleteList = requests.filter((r: any) =>
    r.assigned_to === profile?.id && r.status === 'approved' && !r.completed_at
  )
  // shared/requestRules.ts's getAssigneePool expects web's profile shape (role.name);
  // mobile's Profile carries role_name flat — adapt once here, not in the shared file.

  const assigneePoolSource = orgProfiles.map(p => ({ ...p, role: { name: p.role_name } }))
  const activeList = tab === 'mine' ? myRequests : tab === 'inbox' ? inbox : toCompleteList
  const filtered = filter === 'all' ? activeList : activeList.filter(r => r.status === filter)
  const pendingCount = activeList.filter(r => r.status === 'pending').length
  const approvedCount = activeList.filter(r => r.status === 'approved').length
  const completedCount = activeList.filter(r => r.status === 'completed').length
  const rejectedCount = activeList.filter(r => r.status === 'rejected').length
  const selectedRecipient = orgProfiles.find(p => p.id === recipientId)
  const completedAttachmentUrl = detailRequest?.response_attachment_url

  const renderItem = ({ item }: { item: Request }) => (
    <TouchableOpacity style={styles.card} onPress={() => setDetailRequest(item)}>
      <View style={styles.cardTop}>
        <View style={{ flex: 1, marginRight: 8 }}>
          <Text style={styles.cardTitle}>{item.title}</Text>
          <Text style={styles.cardType}>{item.request_type}</Text>
        </View>
        <View style={[styles.badge, { borderColor: STATUS_COLOR[item.status], backgroundColor: STATUS_COLOR[item.status] + '22' }]}>
          <Text style={[styles.badgeText, { color: STATUS_COLOR[item.status] }]}>{item.status.toUpperCase()}</Text>
        </View>
      </View>
      <Text style={styles.cardDesc} numberOfLines={2}>{item.description}</Text>
      <View style={styles.cardMeta}>
        <Text style={styles.metaText}>
          {tab === 'mine' ? `To: ${item.recipient_name}` : tab === 'inbox' ? `From: ${item.sender_name}` : `From: ${item.sender_name}`}
        </Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <View style={[styles.priorityDot, { backgroundColor: PRIORITY_COLOR[item.priority] ?? '#6b8f71' }]} />
          <Text style={styles.metaText}>{item.priority}</Text>
        </View>
      </View>
    </TouchableOpacity>
  )

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Requests</Text>
        <TouchableOpacity style={styles.newBtn} onPress={() => setModalVisible(true)}>
          <Text style={styles.newBtnText}>+ New</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.tabRow}>
        <TouchableOpacity style={[styles.tabBtn, tab === 'mine' && styles.tabBtnActive]} onPress={() => { setTab('mine'); setFilter('all') }}>
          <Text style={[styles.tabText, tab === 'mine' && styles.tabTextActive]}>
            Mine {myRequests.length > 0 ? `(${myRequests.length})` : ''}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.tabBtn, tab === 'inbox' && styles.tabBtnActive]} onPress={() => { setTab('inbox'); setFilter('all') }}>
          <Text style={[styles.tabText, tab === 'inbox' && styles.tabTextActive]}>
            Inbox {inbox.filter(r => r.status === 'pending').length > 0 ? `(${inbox.filter(r => r.status === 'pending').length})` : ''}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.tabBtn, tab === 'complete' && styles.tabBtnActive]} onPress={() => { setTab('complete'); setFilter('all') }}>
          <Text style={[styles.tabText, tab === 'complete' && styles.tabTextActive]}>
            To Do {toCompleteList.length > 0 ? `(${toCompleteList.length})` : ''}
          </Text>
        </TouchableOpacity>
      </View>

      <View style={styles.statsRow}>
        <TouchableOpacity style={[styles.statCard, { borderTopColor: '#c9a84c' }, filter === 'pending' && styles.statCardActive]} onPress={() => setFilter(filter === 'pending' ? 'all' : 'pending')}>
          <Text style={styles.statNum}>{pendingCount}</Text>
          <Text style={styles.statLabel}>Pending</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.statCard, { borderTopColor: '#4caf82' }, filter === 'approved' && styles.statCardActive]} onPress={() => setFilter(filter === 'approved' ? 'all' : 'approved')}>
          <Text style={styles.statNum}>{approvedCount}</Text>
          <Text style={styles.statLabel}>Approved</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.statCard, { borderTopColor: '#64b5f6' }, filter === 'completed' && styles.statCardActive]} onPress={() => setFilter(filter === 'completed' ? 'all' : 'completed')}>
          <Text style={styles.statNum}>{completedCount}</Text>
          <Text style={styles.statLabel}>Completed</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.statCard, { borderTopColor: '#e05c5c' }, filter === 'rejected' && styles.statCardActive]} onPress={() => setFilter(filter === 'rejected' ? 'all' : 'rejected')}>
          <Text style={styles.statNum}>{rejectedCount}</Text>
          <Text style={styles.statLabel}>Rejected</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.filterRow}>
        {(['all', 'pending', 'approved', 'completed', 'rejected'] as const).map(f => (
          <TouchableOpacity key={f} style={[styles.filterTab, filter === f && styles.filterTabActive]} onPress={() => setFilter(f)}>
            <Text style={[styles.filterText, filter === f && styles.filterTextActive]}>{f.charAt(0).toUpperCase() + f.slice(1)}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {loading ? (
        <View style={styles.center}><ActivityIndicator color="#c9a84c" size="large" /></View>
       ) : filtered.length === 0 ? (
        <View style={styles.center}>
          <Text style={styles.emptyIcon}>{tab === 'mine' ? '📋' : tab === 'inbox' ? '📥' : '✅'}</Text>
          <Text style={styles.emptyText}>
            {tab === 'mine' ? 'No requests sent' : tab === 'inbox' ? 'Your inbox is empty' : 'Nothing to complete'}
          </Text>
        </View>
      ) : (

        <FlatList
          data={filtered}
          keyExtractor={i => i.id}
          renderItem={renderItem}
          contentContainerStyle={{ padding: 16, gap: 12 }}
          onRefresh={loadData}
          refreshing={loading}
        />
      )}

{/* Detail Overlay */}
      {!!detailRequest && (
        <View style={styles.modalOverlay}>
          <KeyboardAvoidingView
            style={styles.modalKav}
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          >
            <View style={styles.modalCard}>
              <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
                <Text style={styles.modalTitle}>{detailRequest?.title}</Text>

                <View style={styles.detailRow}>
                  <View style={[styles.badge, {
                    borderColor: STATUS_COLOR[detailRequest?.status ?? 'pending'],
                    backgroundColor: STATUS_COLOR[detailRequest?.status ?? 'pending'] + '22'
                  }]}>
                    <Text style={[styles.badgeText, { color: STATUS_COLOR[detailRequest?.status ?? 'pending'] }]}>
                      {detailRequest?.status?.toUpperCase()}
                    </Text>
                  </View>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                    <View style={[styles.priorityDot, { backgroundColor: PRIORITY_COLOR[detailRequest?.priority ?? 'Medium'] }]} />
                    <Text style={styles.metaText}>{detailRequest?.priority} Priority</Text>
                  </View>
                </View>

                <Text style={styles.label}>Type</Text>
                <Text style={styles.detailValue}>{detailRequest?.request_type}</Text>

                <Text style={styles.label}>
                  {detailRequest?.requested_by === profile?.id ? 'Sent To' : 'Sent By'}
                </Text>
                <Text style={styles.detailValue}>
                  {detailRequest?.requested_by === profile?.id
                    ? detailRequest?.recipient_name
                    : detailRequest?.sender_name}
                </Text>

                <Text style={styles.label}>Description</Text>
                <Text style={styles.detailValue}>{detailRequest?.description}</Text>

                <Text style={styles.label}>Date</Text>
                <Text style={styles.detailValue}>
                  {detailRequest ? new Date(detailRequest.created_at).toLocaleDateString('en-GB', {
                    day: 'numeric', month: 'long', year: 'numeric'
                  }) : ''}
                </Text>

                {detailRequest?.status === 'completed' && (
                  <View style={{ marginTop: 8, borderTopWidth: 1, borderTopColor: '#1e4d2b', paddingTop: 16 }}>
                    <Text style={styles.label}>Completed By</Text>
                    <Text style={styles.detailValue}>{detailRequest?.completed_by_name ?? '—'}</Text>

                    <Text style={styles.label}>Completed On</Text>
                    <Text style={styles.detailValue}>
                      {detailRequest?.completed_at ? new Date(detailRequest.completed_at).toLocaleDateString('en-GB', {
                        day: 'numeric', month: 'long', year: 'numeric'
                      }) : '—'}
                    </Text>

                    {detailRequest?.completion_notes && (
                      <>
                        <Text style={styles.label}>Completion Notes</Text>
                        <Text style={styles.detailValue}>{detailRequest.completion_notes}</Text>
                      </>
                    )}

                    {completedAttachmentUrl && (
                      <TouchableOpacity onPress={() => Linking.openURL(completedAttachmentUrl)}>
                        <Text style={{ color: '#c9a84c', fontWeight: '600', fontSize: 13, marginBottom: 4 }}>
                          📎 View Attachment
                        </Text>
                      </TouchableOpacity>
                    )}
                  </View>
                )}

                {detailRequest?.recipient_id === profile?.id && detailRequest?.status === 'pending' && (
                  <View style={{ marginTop: 8, borderTopWidth: 1, borderTopColor: '#1e4d2b', paddingTop: 16 }}>
                    <Text style={styles.label}>Response Message</Text>
                    <TextInput
                      style={[styles.input, { height: 80, marginBottom: 12 }]}
                      placeholder="Add a response message..."
                      placeholderTextColor="#4a7a54"
                      value={responseMsg}
                      onChangeText={setResponseMsg}
                      multiline
                      textAlignVertical="top"
                    />

                    <Text style={styles.label}>Who Will Complete This?</Text>
                    <View style={[styles.typeRow, { marginBottom: 12 }]}>
                      {canRoleComplete(toSharedType(detailRequest.request_type), profile?.role_name) && (
                        <TouchableOpacity
                          style={[styles.typeBtn, completionMode === 'self' && styles.typeBtnActive, { flex: 1 }]}
                          onPress={() => setCompletionMode('self')}
                        >
                          <Text style={[styles.typeBtnText, completionMode === 'self' && styles.typeBtnTextActive]}>I'll Do It</Text>
                        </TouchableOpacity>
                      )}
                      <TouchableOpacity
                        style={[styles.typeBtn, completionMode === 'assign' && styles.typeBtnActive, { flex: 1 }]}
                        onPress={() => setCompletionMode('assign')}
                      >
                        <Text style={[styles.typeBtnText, completionMode === 'assign' && styles.typeBtnTextActive]}>Assign Someone</Text>
                      </TouchableOpacity>
                    </View>

                    {completionMode === 'assign' && (
                      <>
                        <TouchableOpacity style={styles.recipientPicker} onPress={() => setShowAssigneePicker(!showAssigneePicker)}>
                          <Text style={assigneeId ? styles.recipientSelected : styles.recipientPlaceholder}>
                            {assigneeId
                              ? orgProfiles.find(p => p.id === assigneeId)?.full_name
                              : 'Select person...'}
                          </Text>
                          <Text style={styles.chevron}>{showAssigneePicker ? '▲' : '▼'}</Text>
                        </TouchableOpacity>
                        {showAssigneePicker && (
                          <View style={styles.recipientDropdown}>
                            {getAssigneePool(toSharedType(detailRequest.request_type), assigneePoolSource).map(p => (
                              <TouchableOpacity
                                key={p.id}
                                style={[styles.recipientOption, assigneeId === p.id && styles.recipientOptionActive]}
                                onPress={() => { setAssigneeId(p.id); setShowAssigneePicker(false) }}
                              >
                                <Text style={[styles.recipientOptionText, assigneeId === p.id && { color: '#0d2818' }]}>
                                  {p.full_name}{p.role_name ? ` (${p.role_name})` : ''}
                                </Text>
                              </TouchableOpacity>
                            ))}
                          </View>
                        )}
                      </>
                    )}

                    <View style={[styles.actionRow, { marginTop: 12 }]}>
                      <TouchableOpacity
                        style={[styles.actionBtn, { borderColor: '#4caf82', flex: 1, justifyContent: 'center', backgroundColor: '#4caf8222' }]}
                        onPress={handleApprove}
                      >
                        <Text style={[styles.actionBtnText, { color: '#4caf82' }]}>✓ Approve</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[styles.actionBtn, { borderColor: '#e05c5c', flex: 1, justifyContent: 'center', backgroundColor: '#e05c5c22' }]}
                        onPress={handleReject}
                      >
                        <Text style={[styles.actionBtnText, { color: '#e05c5c' }]}>✕ Reject</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                )}

                {detailRequest?.assigned_to === profile?.id &&
                  detailRequest?.status === 'approved' &&
                  !detailRequest?.completed_at && (
                  <View style={{ marginTop: 8, borderTopWidth: 1, borderTopColor: '#1e4d2b', paddingTop: 16 }}>
                    <Text style={styles.label}>Completion Notes</Text>
                    <TextInput
                      style={[styles.input, { height: 80, marginBottom: 12 }]}
                      placeholder="Describe what was done..."
                      placeholderTextColor="#4a7a54"
                      value={completionNotes}
                      onChangeText={setCompletionNotes}
                      multiline
                      textAlignVertical="top"
                    />

                   <Text style={styles.label}>
                      Attach File {ATTACHMENT_REQUIRED_TYPES.has(toSharedType(detailRequest.request_type)) ? '(required)' : '(optional)'}
                    </Text>
                    <TouchableOpacity
                      style={[styles.recipientPicker, { marginBottom: 8 }]}
                      onPress={() => setShowAttachOptions(!showAttachOptions)}
                      disabled={uploadingCompletionFile}
                    >
                      <Text style={completionFile ? styles.recipientSelected : styles.recipientPlaceholder}>
                        {completionFile ? completionFile.name : 'Tap to attach a file...'}
                      </Text>
                      <Text style={styles.chevron}>{showAttachOptions ? '▲' : '▼'}</Text>
                    </TouchableOpacity>

                    {showAttachOptions && (
                      <View style={[styles.recipientDropdown, { marginBottom: 12 }]}>
                        <TouchableOpacity style={styles.recipientOption} onPress={pickCompletionPhoto}>
                          <Text style={styles.recipientOptionText}>📷 Choose Photo</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={[styles.recipientOption, { borderBottomWidth: 0 }]} onPress={pickCompletionDocument}>
                          <Text style={styles.recipientOptionText}>📄 Choose Document (PDF, Word)</Text>
                        </TouchableOpacity>
                      </View>
                    )}

                    {completionFile && (
                      <TouchableOpacity onPress={() => setCompletionFile(null)} style={{ marginBottom: 12 }}>
                        <Text style={{ color: '#e05c5c', fontSize: 12, fontWeight: '600' }}>✕ Remove file</Text>
                      </TouchableOpacity>
                    )}

                    <TouchableOpacity
                      style={[styles.submitBtn, (completing || uploadingCompletionFile) && { opacity: 0.6 }]}
                      onPress={handleComplete}
                      disabled={completing || uploadingCompletionFile}
                    >
                      {completing || uploadingCompletionFile
                        ? <ActivityIndicator color="#0d2818" />
                        : <Text style={styles.submitBtnText}>✓ Mark as Completed</Text>}
                    </TouchableOpacity>
                  </View>
                )}

                <TouchableOpacity
                  style={styles.closeBar}
                  onPress={() => { setDetailRequest(null); setResponseMsg('') }}
                >
                  <Text style={styles.closeBarText}>Close</Text>
                </TouchableOpacity>
              </ScrollView>
            </View>
          </KeyboardAvoidingView>
        </View>
      )}

      {/* New Request Overlay */}
      {modalVisible && (
        <View style={styles.modalOverlay}>
          <KeyboardAvoidingView
            style={styles.modalKav}
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          >
            <View style={styles.modalCard}>
              <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
                <Text style={styles.modalTitle}>New Request</Text>
                <Text style={styles.label}>Recipient</Text>
                <TouchableOpacity style={styles.recipientPicker} onPress={() => setShowRecipientPicker(!showRecipientPicker)}>
                  <Text style={selectedRecipient ? styles.recipientSelected : styles.recipientPlaceholder}>
                    {selectedRecipient ? selectedRecipient.full_name : 'Select recipient...'}
                  </Text>
                  <Text style={styles.chevron}>{showRecipientPicker ? '▲' : '▼'}</Text>
                </TouchableOpacity>
                {showRecipientPicker && (
                  <View style={styles.recipientDropdown}>
                    {getRecipientPool(toSharedType(requestType), orgProfiles.map(p => ({ ...p, role: { name: p.role_name } }))).map((p: any) => (
                      <TouchableOpacity key={p.id} style={[styles.recipientOption, recipientId === p.id && styles.recipientOptionActive]} onPress={() => { setRecipientId(p.id); setShowRecipientPicker(false) }}>
                        <Text style={[styles.recipientOptionText, recipientId === p.id && { color: '#0d2818' }]}>{p.full_name}{p.role_name ? ` (${p.role_name})` : ''}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                )}

                <View style={styles.typeRow}>
                  {(requestOptions[profile?.role_name ?? ''] ?? requestOptions.default).map(t => (
                    <TouchableOpacity key={t} style={[styles.typeBtn, requestType === t && styles.typeBtnActive]} onPress={() => { setRequestType(t); setRecipientId(''); setLogisticsType('') }}>
                      <Text style={[styles.typeBtnText, requestType === t && styles.typeBtnTextActive]}>{t}</Text>
                    </TouchableOpacity>
                  ))}
                </View>

                {requestType === 'Leave Request' && (
                  <>
                    <Text style={styles.label}>Start Date</Text>
                    <TextInput
                      style={styles.input}
                      placeholder="YYYY-MM-DD"
                      placeholderTextColor="#4a7a54"
                      value={leaveFrom}
                      onChangeText={setLeaveFrom}
                    />
                    <Text style={styles.label}>End Date</Text>
                    <TextInput
                      style={styles.input}
                      placeholder="YYYY-MM-DD"
                      placeholderTextColor="#4a7a54"
                      value={leaveTo}
                      onChangeText={setLeaveTo}
                    />
                  </>
                )}

                {requestType === 'Petty Cash Request' && (
                  <>
                    <Text style={styles.label}>Category</Text>
                    <View style={[styles.typeRow, { marginBottom: 12 }]}>
                      {['Project', 'Administrative'].map(c => (
                        <TouchableOpacity
                          key={c}
                          style={[styles.typeBtn, pettyCashCategory === c && styles.typeBtnActive, { flex: 1 }]}
                          onPress={() => { setPettyCashCategory(c); if (c === 'Administrative') setProjectId('') }}
                        >
                          <Text style={[styles.typeBtnText, pettyCashCategory === c && styles.typeBtnTextActive]}>{c}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>

                    {pettyCashCategory === 'Project' && (
                      <>
                        <Text style={styles.label}>Project</Text>
                        <TouchableOpacity style={styles.recipientPicker} onPress={() => setShowProjectPicker(!showProjectPicker)}>
                          <Text style={projectId ? styles.recipientSelected : styles.recipientPlaceholder}>
                            {projectId
                              ? projects.find(p => p.id === projectId)?.name
                              : 'Select project...'}
                          </Text>
                          <Text style={styles.chevron}>{showProjectPicker ? '▲' : '▼'}</Text>
                        </TouchableOpacity>
                        {showProjectPicker && (
                          <View style={styles.recipientDropdown}>
                            {projects.map(p => (
                              <TouchableOpacity
                                key={p.id}
                                style={[styles.recipientOption, projectId === p.id && styles.recipientOptionActive]}
                                onPress={() => { setProjectId(p.id); setShowProjectPicker(false) }}
                              >
                                <Text style={[styles.recipientOptionText, projectId === p.id && { color: '#0d2818' }]}>{p.name}</Text>
                              </TouchableOpacity>
                            ))}
                          </View>
                        )}
                      </>
                    )}

                    <Text style={styles.label}>Purpose</Text>
                    <TextInput
                      style={styles.input}
                      placeholder="e.g. Site transport, minor tools"
                      placeholderTextColor="#4a7a54"
                      value={pettyCashPurpose}
                      onChangeText={setPettyCashPurpose}
                    />

                    <Text style={styles.label}>Amount (GHS)</Text>
                    <TextInput
                      style={styles.input}
                      placeholder="0.00"
                      placeholderTextColor="#4a7a54"
                      value={amount}
                      onChangeText={setAmount}
                      keyboardType="numeric"
                    />
                  </>
                )}

                <Text style={styles.label}>Priority</Text>
                <View style={styles.typeRow}>
                  {['Low', 'Medium', 'High', 'Critical'].map(p => (
                    <TouchableOpacity key={p} style={[styles.typeBtn, priority === p && styles.typeBtnActive]} onPress={() => setPriority(p)}>
                      <Text style={[styles.typeBtnText, priority === p && styles.typeBtnTextActive]}>{p}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
                <Text style={styles.label}>Title</Text>
                <TextInput style={styles.input} placeholder="e.g. Equipment needed on site" placeholderTextColor="#4a7a54" value={title} onChangeText={setTitle} />
                <Text style={styles.label}>Description</Text>
                <TextInput style={[styles.input, styles.textarea]} placeholder="Describe your request..." placeholderTextColor="#4a7a54" value={description} onChangeText={setDescription} multiline numberOfLines={4} textAlignVertical="top" />
                <View style={styles.modalBtns}>
                  <TouchableOpacity style={styles.cancelBtn} onPress={() => { setModalVisible(false); resetForm() }}>
                    <Text style={styles.cancelBtnText}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[styles.submitBtn, submitting && { opacity: 0.6 }]} onPress={submitRequest} disabled={submitting}>
                    {submitting ? <ActivityIndicator color="#0d2818" /> : <Text style={styles.submitBtnText}>Submit</Text>}
                  </TouchableOpacity>
                </View>
              </ScrollView>
            </View>
          </KeyboardAvoidingView>
        </View>
      )}
      {requestType === 'Vendor Payment Request' && (
                  <>
                    <Text style={styles.label}>Vendor / Payee Name *</Text>
                    <TextInput style={styles.input} placeholder="Vendor or company name" placeholderTextColor="#4a7a54" value={vendorName} onChangeText={setVendorName} />

                    <Text style={styles.label}>Invoice Number</Text>
                    <TextInput style={styles.input} placeholder="INV-001" placeholderTextColor="#4a7a54" value={invoiceNo} onChangeText={setInvoiceNo} />

                    <Text style={styles.label}>Amount (GHS) *</Text>
                    <TextInput style={styles.input} placeholder="0.00" placeholderTextColor="#4a7a54" value={amount} onChangeText={setAmount} keyboardType="numeric" />

                    <Text style={styles.label}>Related Project</Text>
                    <TouchableOpacity style={styles.recipientPicker} onPress={() => setShowProjectPicker(!showProjectPicker)}>
                      <Text style={projectId ? styles.recipientSelected : styles.recipientPlaceholder}>
                        {projectId ? projects.find(p => p.id === projectId)?.name : 'Select project...'}
                      </Text>
                      <Text style={styles.chevron}>{showProjectPicker ? '▲' : '▼'}</Text>
                    </TouchableOpacity>
                    {showProjectPicker && (
                      <View style={styles.recipientDropdown}>
                        {projects.map(p => (
                          <TouchableOpacity key={p.id} style={[styles.recipientOption, projectId === p.id && styles.recipientOptionActive]} onPress={() => { setProjectId(p.id); setShowProjectPicker(false) }}>
                            <Text style={[styles.recipientOptionText, projectId === p.id && { color: '#0d2818' }]}>{p.name}</Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                    )}

                    <Text style={styles.label}>Bank Name</Text>
                    <TextInput style={styles.input} placeholder="e.g. GCB Bank" placeholderTextColor="#4a7a54" value={vendorBank} onChangeText={setVendorBank} />

                    <Text style={styles.label}>Account Number</Text>
                    <TextInput style={styles.input} placeholder="Account number" placeholderTextColor="#4a7a54" value={vendorAccNo} onChangeText={setVendorAccNo} />

                    <Text style={styles.label}>Branch</Text>
                    <TextInput style={styles.input} placeholder="Branch name" placeholderTextColor="#4a7a54" value={vendorBranch} onChangeText={setVendorBranch} />
                  </>
                )}

                {requestType === 'Fund Transfer Request' && (
                  <>
                    <Text style={styles.label}>From Account</Text>
                    <TextInput style={styles.input} placeholder="Source account" placeholderTextColor="#4a7a54" value={fromAccount} onChangeText={setFromAccount} />

                    <Text style={styles.label}>To Account</Text>
                    <TextInput style={styles.input} placeholder="Destination account" placeholderTextColor="#4a7a54" value={toAccount} onChangeText={setToAccount} />

                    <Text style={styles.label}>Amount (GHS) *</Text>
                    <TextInput style={styles.input} placeholder="0.00" placeholderTextColor="#4a7a54" value={amount} onChangeText={setAmount} keyboardType="numeric" />

                    <Text style={styles.label}>Related Project</Text>
                    <TouchableOpacity style={styles.recipientPicker} onPress={() => setShowProjectPicker(!showProjectPicker)}>
                      <Text style={projectId ? styles.recipientSelected : styles.recipientPlaceholder}>
                        {projectId ? projects.find(p => p.id === projectId)?.name : 'Select project...'}
                      </Text>
                      <Text style={styles.chevron}>{showProjectPicker ? '▲' : '▼'}</Text>
                    </TouchableOpacity>
                    {showProjectPicker && (
                      <View style={styles.recipientDropdown}>
                        {projects.map(p => (
                          <TouchableOpacity key={p.id} style={[styles.recipientOption, projectId === p.id && styles.recipientOptionActive]} onPress={() => { setProjectId(p.id); setShowProjectPicker(false) }}>
                            <Text style={[styles.recipientOptionText, projectId === p.id && { color: '#0d2818' }]}>{p.name}</Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                    )}

                    <Text style={styles.label}>Purpose of Transfer</Text>
                    <TextInput style={[styles.input, styles.textarea]} placeholder="Explain the reason for this transfer..." placeholderTextColor="#4a7a54" value={transferPurpose} onChangeText={setTransferPurpose} multiline numberOfLines={3} textAlignVertical="top" />
                  </>
                )}

                {requestType === 'Expense Reimbursement Request' && (
                  <>
                    <Text style={styles.label}>Expense Date</Text>
                    <TextInput style={styles.input} placeholder="YYYY-MM-DD" placeholderTextColor="#4a7a54" value={expDate} onChangeText={setExpDate} />

                    <Text style={styles.label}>Category</Text>
                    <TouchableOpacity style={styles.recipientPicker} onPress={() => setShowExpCategoryPicker(!showExpCategoryPicker)}>
                      <Text style={expCategory ? styles.recipientSelected : styles.recipientPlaceholder}>{expCategory || 'Select category...'}</Text>
                      <Text style={styles.chevron}>{showExpCategoryPicker ? '▲' : '▼'}</Text>
                    </TouchableOpacity>
                    {showExpCategoryPicker && (
                      <View style={styles.recipientDropdown}>
                        {EXPENSE_CATEGORIES.map(c => (
                          <TouchableOpacity key={c} style={[styles.recipientOption, expCategory === c && styles.recipientOptionActive]} onPress={() => { setExpCategory(c); setShowExpCategoryPicker(false) }}>
                            <Text style={[styles.recipientOptionText, expCategory === c && { color: '#0d2818' }]}>{c}</Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                    )}

                    <Text style={styles.label}>Amount (GHS) *</Text>
                    <TextInput style={styles.input} placeholder="0.00" placeholderTextColor="#4a7a54" value={amount} onChangeText={setAmount} keyboardType="numeric" />

                    <Text style={styles.label}>Receipt / Reference No.</Text>
                    <TextInput style={styles.input} placeholder="Receipt or reference" placeholderTextColor="#4a7a54" value={receiptRef} onChangeText={setReceiptRef} />
                  </>
                )}

                {requestType === 'Internal Audit Request' && (
                  <>
                    <Text style={styles.label}>Audit Type</Text>
                    <TouchableOpacity style={styles.recipientPicker} onPress={() => setShowAuditTypePicker(!showAuditTypePicker)}>
                      <Text style={auditType ? styles.recipientSelected : styles.recipientPlaceholder}>{auditType || 'Select audit type...'}</Text>
                      <Text style={styles.chevron}>{showAuditTypePicker ? '▲' : '▼'}</Text>
                    </TouchableOpacity>
                    {showAuditTypePicker && (
                      <View style={styles.recipientDropdown}>
                        {AUDIT_TYPES.map(a => (
                          <TouchableOpacity key={a} style={[styles.recipientOption, auditType === a && styles.recipientOptionActive]} onPress={() => { setAuditType(a); setShowAuditTypePicker(false) }}>
                            <Text style={[styles.recipientOptionText, auditType === a && { color: '#0d2818' }]}>{a}</Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                    )}

                    <Text style={styles.label}>Related Project</Text>
                    <TouchableOpacity style={styles.recipientPicker} onPress={() => setShowProjectPicker(!showProjectPicker)}>
                      <Text style={projectId ? styles.recipientSelected : styles.recipientPlaceholder}>
                        {projectId ? projects.find(p => p.id === projectId)?.name : 'Select project...'}
                      </Text>
                      <Text style={styles.chevron}>{showProjectPicker ? '▲' : '▼'}</Text>
                    </TouchableOpacity>
                    {showProjectPicker && (
                      <View style={styles.recipientDropdown}>
                        {projects.map(p => (
                          <TouchableOpacity key={p.id} style={[styles.recipientOption, projectId === p.id && styles.recipientOptionActive]} onPress={() => { setProjectId(p.id); setShowProjectPicker(false) }}>
                            <Text style={[styles.recipientOptionText, projectId === p.id && { color: '#0d2818' }]}>{p.name}</Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                    )}

                    <Text style={styles.label}>Period From</Text>
                    <TextInput style={styles.input} placeholder="YYYY-MM-DD" placeholderTextColor="#4a7a54" value={auditPeriodFrom} onChangeText={setAuditPeriodFrom} />

                    <Text style={styles.label}>Period To</Text>
                    <TextInput style={styles.input} placeholder="YYYY-MM-DD" placeholderTextColor="#4a7a54" value={auditPeriodTo} onChangeText={setAuditPeriodTo} />

                    <Text style={styles.label}>Scope / Departments to Audit</Text>
                    <TextInput style={[styles.input, styles.textarea]} placeholder="Describe the scope and departments..." placeholderTextColor="#4a7a54" value={auditScope} onChangeText={setAuditScope} multiline numberOfLines={3} textAlignVertical="top" />
                  </>
                )}

                {requestType === 'Project Funding Request' && (
                  <>
                    <Text style={styles.label}>Project *</Text>
                    <TouchableOpacity style={styles.recipientPicker} onPress={() => setShowProjectPicker(!showProjectPicker)}>
                      <Text style={projectId ? styles.recipientSelected : styles.recipientPlaceholder}>
                        {projectId ? projects.find(p => p.id === projectId)?.name : 'Select project...'}
                      </Text>
                      <Text style={styles.chevron}>{showProjectPicker ? '▲' : '▼'}</Text>
                    </TouchableOpacity>
                    {showProjectPicker && (
                      <View style={styles.recipientDropdown}>
                        {projects.map(p => (
                          <TouchableOpacity key={p.id} style={[styles.recipientOption, projectId === p.id && styles.recipientOptionActive]} onPress={() => { setProjectId(p.id); setShowProjectPicker(false) }}>
                            <Text style={[styles.recipientOptionText, projectId === p.id && { color: '#0d2818' }]}>{p.name}</Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                    )}

                    <Text style={styles.label}>Amount Requested (GHS)</Text>
                    <TextInput style={styles.input} placeholder="0.00" placeholderTextColor="#4a7a54" value={amount} onChangeText={setAmount} keyboardType="numeric" />

                    <Text style={styles.label}>Funding Timeline</Text>
                    <TextInput style={styles.input} placeholder="e.g. Within 2 weeks" placeholderTextColor="#4a7a54" value={fundingTimeline} onChangeText={setFundingTimeline} />

                    <Text style={styles.label}>Justification</Text>
                    <TextInput style={[styles.input, styles.textarea]} placeholder="Explain why the funding is needed..." placeholderTextColor="#4a7a54" value={fundingJustification} onChangeText={setFundingJustification} multiline numberOfLines={3} textAlignVertical="top" />
                  </>
                )}

                {requestType === 'Recruitment Request' && (
                  <>
                    <Text style={styles.label}>Position Title *</Text>
                    <TextInput style={styles.input} placeholder="e.g. Senior Site Engineer" placeholderTextColor="#4a7a54" value={recruitPosition} onChangeText={setRecruitPosition} />

                    <Text style={styles.label}>Department</Text>
                    <TextInput style={styles.input} placeholder="e.g. Construction" placeholderTextColor="#4a7a54" value={recruitDept} onChangeText={setRecruitDept} />

                    <Text style={styles.label}>Number of Vacancies</Text>
                    <TextInput style={styles.input} placeholder="1" placeholderTextColor="#4a7a54" value={recruitVacancies} onChangeText={setRecruitVacancies} keyboardType="numeric" />

                    <Text style={styles.label}>Required By (Date)</Text>
                    <TextInput style={styles.input} placeholder="YYYY-MM-DD" placeholderTextColor="#4a7a54" value={recruitDueDate} onChangeText={setRecruitDueDate} />

                    <Text style={styles.label}>Minimum Qualifications / Requirements</Text>
                    <TextInput style={[styles.input, styles.textarea]} placeholder="e.g. BSc Civil Engineering, 5 years experience..." placeholderTextColor="#4a7a54" value={recruitQual} onChangeText={setRecruitQual} multiline numberOfLines={3} textAlignVertical="top" />
                  </>
                )}

                {requestType === 'Training Request' && (
                  <>
                    <Text style={styles.label}>Training Type / Programme</Text>
                    <TextInput style={styles.input} placeholder="e.g. Health & Safety" placeholderTextColor="#4a7a54" value={trainType} onChangeText={setTrainType} />

                    <Text style={styles.label}>Training Provider</Text>
                    <TextInput style={styles.input} placeholder="Provider name" placeholderTextColor="#4a7a54" value={trainProvider} onChangeText={setTrainProvider} />

                    <Text style={styles.label}>Duration</Text>
                    <TextInput style={styles.input} placeholder="e.g. 3 days" placeholderTextColor="#4a7a54" value={trainDuration} onChangeText={setTrainDuration} />

                    <Text style={styles.label}>Training Date</Text>
                    <TextInput style={styles.input} placeholder="YYYY-MM-DD" placeholderTextColor="#4a7a54" value={trainDate} onChangeText={setTrainDate} />

                    <Text style={styles.label}>Number of Staff</Text>
                    <TextInput style={styles.input} placeholder="0" placeholderTextColor="#4a7a54" value={trainStaff} onChangeText={setTrainStaff} keyboardType="numeric" />

                    <Text style={styles.label}>Estimated Cost (GHS)</Text>
                    <TextInput style={styles.input} placeholder="0.00" placeholderTextColor="#4a7a54" value={trainCost} onChangeText={setTrainCost} keyboardType="numeric" />
                  </>
                )}

                {requestType === 'Disciplinary Action Request' && (
                  <>
                    <Text style={styles.label}>Employee *</Text>
                    <TouchableOpacity style={styles.recipientPicker} onPress={() => setShowDiscEmployeePicker(!showDiscEmployeePicker)}>
                      <Text style={discEmployee ? styles.recipientSelected : styles.recipientPlaceholder}>
                        {discEmployee ? orgProfiles.find(p => p.id === discEmployee)?.full_name : 'Select employee...'}
                      </Text>
                      <Text style={styles.chevron}>{showDiscEmployeePicker ? '▲' : '▼'}</Text>
                    </TouchableOpacity>
                    {showDiscEmployeePicker && (
                      <View style={styles.recipientDropdown}>
                        {orgProfiles.map(p => (
                          <TouchableOpacity key={p.id} style={[styles.recipientOption, discEmployee === p.id && styles.recipientOptionActive]} onPress={() => { setDiscEmployee(p.id); setShowDiscEmployeePicker(false) }}>
                            <Text style={[styles.recipientOptionText, discEmployee === p.id && { color: '#0d2818' }]}>{p.full_name}</Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                    )}

                    <Text style={styles.label}>Incident Date</Text>
                    <TextInput style={styles.input} placeholder="YYYY-MM-DD" placeholderTextColor="#4a7a54" value={discIncidentDate} onChangeText={setDiscIncidentDate} />

                    <Text style={styles.label}>Action Type *</Text>
                    <TouchableOpacity style={styles.recipientPicker} onPress={() => setShowDiscActionPicker(!showDiscActionPicker)}>
                      <Text style={discActionType ? styles.recipientSelected : styles.recipientPlaceholder}>{discActionType || 'Select action type...'}</Text>
                      <Text style={styles.chevron}>{showDiscActionPicker ? '▲' : '▼'}</Text>
                    </TouchableOpacity>
                    {showDiscActionPicker && (
                      <View style={styles.recipientDropdown}>
                        {DISCIPLINARY_ACTIONS.map(a => (
                          <TouchableOpacity key={a} style={[styles.recipientOption, discActionType === a && styles.recipientOptionActive]} onPress={() => { setDiscActionType(a); setShowDiscActionPicker(false) }}>
                            <Text style={[styles.recipientOptionText, discActionType === a && { color: '#0d2818' }]}>{a}</Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                    )}

                    <Text style={styles.label}>Witnesses (if any)</Text>
                    <TextInput style={styles.input} placeholder="Names of witnesses" placeholderTextColor="#4a7a54" value={discWitnesses} onChangeText={setDiscWitnesses} />

                    <Text style={styles.label}>Incident Description</Text>
                    <TextInput style={[styles.input, styles.textarea]} placeholder="Describe the incident or misconduct in detail..." placeholderTextColor="#4a7a54" value={discDesc} onChangeText={setDiscDesc} multiline numberOfLines={4} textAlignVertical="top" />
                  </>
                )}

                {requestType === 'Contract Approval Request' && (
                  <>
                    <Text style={styles.label}>Vendor / Contractor *</Text>
                    <TextInput style={styles.input} placeholder="Vendor name" placeholderTextColor="#4a7a54" value={contractVendor} onChangeText={setContractVendor} />

                    <Text style={styles.label}>Contract Type</Text>
                    <TouchableOpacity style={styles.recipientPicker} onPress={() => setShowContractTypePicker(!showContractTypePicker)}>
                      <Text style={contractType ? styles.recipientSelected : styles.recipientPlaceholder}>{contractType || 'Select contract type...'}</Text>
                      <Text style={styles.chevron}>{showContractTypePicker ? '▲' : '▼'}</Text>
                    </TouchableOpacity>
                    {showContractTypePicker && (
                      <View style={styles.recipientDropdown}>
                        {CONTRACT_TYPES.map(c => (
                          <TouchableOpacity key={c} style={[styles.recipientOption, contractType === c && styles.recipientOptionActive]} onPress={() => { setContractType(c); setShowContractTypePicker(false) }}>
                            <Text style={[styles.recipientOptionText, contractType === c && { color: '#0d2818' }]}>{c}</Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                    )}

                    <Text style={styles.label}>Contract Value (GHS)</Text>
                    <TextInput style={styles.input} placeholder="0.00" placeholderTextColor="#4a7a54" value={contractValue} onChangeText={setContractValue} keyboardType="numeric" />

                    <Text style={styles.label}>Contract Duration</Text>
                    <TextInput style={styles.input} placeholder="e.g. 12 months" placeholderTextColor="#4a7a54" value={contractDuration} onChangeText={setContractDuration} />

                    <Text style={styles.label}>Start Date</Text>
                    <TextInput style={styles.input} placeholder="YYYY-MM-DD" placeholderTextColor="#4a7a54" value={contractStartDate} onChangeText={setContractStartDate} />

                    <Text style={styles.label}>Related Project</Text>
                    <TouchableOpacity style={styles.recipientPicker} onPress={() => setShowProjectPicker(!showProjectPicker)}>
                      <Text style={projectId ? styles.recipientSelected : styles.recipientPlaceholder}>
                        {projectId ? projects.find(p => p.id === projectId)?.name : 'Select project...'}
                      </Text>
                      <Text style={styles.chevron}>{showProjectPicker ? '▲' : '▼'}</Text>
                    </TouchableOpacity>
                    {showProjectPicker && (
                      <View style={styles.recipientDropdown}>
                        {projects.map(p => (
                          <TouchableOpacity key={p.id} style={[styles.recipientOption, projectId === p.id && styles.recipientOptionActive]} onPress={() => { setProjectId(p.id); setShowProjectPicker(false) }}>
                            <Text style={[styles.recipientOptionText, projectId === p.id && { color: '#0d2818' }]}>{p.name}</Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                    )}

                    <Text style={styles.label}>Key Terms & Conditions</Text>
                    <TextInput style={[styles.input, styles.textarea]} placeholder="Summarise key obligations, deliverables and payment terms..." placeholderTextColor="#4a7a54" value={contractTerms} onChangeText={setContractTerms} multiline numberOfLines={3} textAlignVertical="top" />
                  </>
                )}

                {requestType === 'Budget Increase Request' && (
                  <>
                    <Text style={styles.label}>Project *</Text>
                    <TouchableOpacity style={styles.recipientPicker} onPress={() => setShowProjectPicker(!showProjectPicker)}>
                      <Text style={projectId ? styles.recipientSelected : styles.recipientPlaceholder}>
                        {projectId ? projects.find(p => p.id === projectId)?.name : 'Select project...'}
                      </Text>
                      <Text style={styles.chevron}>{showProjectPicker ? '▲' : '▼'}</Text>
                    </TouchableOpacity>
                    {showProjectPicker && (
                      <View style={styles.recipientDropdown}>
                        {projects.map(p => (
                          <TouchableOpacity key={p.id} style={[styles.recipientOption, projectId === p.id && styles.recipientOptionActive]} onPress={() => { setProjectId(p.id); setShowProjectPicker(false) }}>
                            <Text style={[styles.recipientOptionText, projectId === p.id && { color: '#0d2818' }]}>{p.name}</Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                    )}

                    <Text style={styles.label}>Current Budget (GHS)</Text>
                    <TextInput style={styles.input} placeholder="0.00" placeholderTextColor="#4a7a54" value={budgetCurrent} onChangeText={setBudgetCurrent} keyboardType="numeric" />

                    <Text style={styles.label}>Requested Increase (GHS)</Text>
                    <TextInput style={styles.input} placeholder="0.00" placeholderTextColor="#4a7a54" value={budgetRequested} onChangeText={setBudgetRequested} keyboardType="numeric" />

                    {!!budgetCurrent && !!budgetRequested && (
                      <View style={{ backgroundColor: '#c9a84c22', borderWidth: 1, borderColor: '#c9a84c44', borderRadius: 10, padding: 12, marginBottom: 16, alignItems: 'center' }}>
                        <Text style={{ fontSize: 11, color: '#8a9e8d' }}>New Total</Text>
                        <Text style={{ fontSize: 18, fontWeight: '800', color: '#c9a84c' }}>
                          GHS {(Number(budgetCurrent) + Number(budgetRequested)).toLocaleString()}
                        </Text>
                      </View>
                    )}

                    <Text style={styles.label}>Justification for Increase</Text>
                    <TextInput style={[styles.input, styles.textarea]} placeholder="Explain why the additional budget is needed..." placeholderTextColor="#4a7a54" value={budgetJustify} onChangeText={setBudgetJustify} multiline numberOfLines={3} textAlignVertical="top" />
                  </>
                )}

                {requestType === 'Vendor Selection Request' && (
                  <>
                    <Text style={styles.label}>Item / Service Required *</Text>
                    <TextInput style={styles.input} placeholder="Describe what's needed" placeholderTextColor="#4a7a54" value={vendorSelItem} onChangeText={setVendorSelItem} />

                    <Text style={styles.label}>Selection Deadline</Text>
                    <TextInput style={styles.input} placeholder="YYYY-MM-DD" placeholderTextColor="#4a7a54" value={vendorSelDeadline} onChangeText={setVendorSelDeadline} />

                    <Text style={styles.label}>Related Project</Text>
                    <TouchableOpacity style={styles.recipientPicker} onPress={() => setShowProjectPicker(!showProjectPicker)}>
                      <Text style={projectId ? styles.recipientSelected : styles.recipientPlaceholder}>
                        {projectId ? projects.find(p => p.id === projectId)?.name : 'Select project...'}
                      </Text>
                      <Text style={styles.chevron}>{showProjectPicker ? '▲' : '▼'}</Text>
                    </TouchableOpacity>
                    {showProjectPicker && (
                      <View style={styles.recipientDropdown}>
                        {projects.map(p => (
                          <TouchableOpacity key={p.id} style={[styles.recipientOption, projectId === p.id && styles.recipientOptionActive]} onPress={() => { setProjectId(p.id); setShowProjectPicker(false) }}>
                            <Text style={[styles.recipientOptionText, projectId === p.id && { color: '#0d2818' }]}>{p.name}</Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                    )}

                    <Text style={styles.label}>Estimated Budget (GHS)</Text>
                    <TextInput style={styles.input} placeholder="0.00" placeholderTextColor="#4a7a54" value={procCost} onChangeText={setProcCost} keyboardType="numeric" />

                    <Text style={styles.label}>Requirements & Evaluation Criteria</Text>
                    <TextInput style={[styles.input, styles.textarea]} placeholder="List vendor requirements and evaluation criteria..." placeholderTextColor="#4a7a54" value={vendorSelReqs} onChangeText={setVendorSelReqs} multiline numberOfLines={3} textAlignVertical="top" />
                  </>
                )}

                {requestType === 'Supplier Performance Review Request' && (
                  <>
                    <Text style={styles.label}>Supplier Name *</Text>
                    <TextInput style={styles.input} placeholder="Supplier or vendor name" placeholderTextColor="#4a7a54" value={supplierName} onChangeText={setSupplierName} />

                    <Text style={styles.label}>Related Project</Text>
                    <TouchableOpacity style={styles.recipientPicker} onPress={() => setShowProjectPicker(!showProjectPicker)}>
                      <Text style={projectId ? styles.recipientSelected : styles.recipientPlaceholder}>
                        {projectId ? projects.find(p => p.id === projectId)?.name : 'Select project...'}
                      </Text>
                      <Text style={styles.chevron}>{showProjectPicker ? '▲' : '▼'}</Text>
                    </TouchableOpacity>
                    {showProjectPicker && (
                      <View style={styles.recipientDropdown}>
                        {projects.map(p => (
                          <TouchableOpacity key={p.id} style={[styles.recipientOption, projectId === p.id && styles.recipientOptionActive]} onPress={() => { setProjectId(p.id); setShowProjectPicker(false) }}>
                            <Text style={[styles.recipientOptionText, projectId === p.id && { color: '#0d2818' }]}>{p.name}</Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                    )}

                    <Text style={styles.label}>Review Period From</Text>
                    <TextInput style={styles.input} placeholder="YYYY-MM-DD" placeholderTextColor="#4a7a54" value={supplierPeriodFrom} onChangeText={setSupplierPeriodFrom} />

                    <Text style={styles.label}>Review Period To</Text>
                    <TextInput style={styles.input} placeholder="YYYY-MM-DD" placeholderTextColor="#4a7a54" value={supplierPeriodTo} onChangeText={setSupplierPeriodTo} />

                    <Text style={styles.label}>KPIs to Review</Text>
                    <TextInput style={[styles.input, styles.textarea]} placeholder="e.g. Delivery time, Quality, Pricing, Communication..." placeholderTextColor="#4a7a54" value={supplierKPIs} onChangeText={setSupplierKPIs} multiline numberOfLines={3} textAlignVertical="top" />
                  </>
                )}

                {requestType === 'Audit Request' && (
                  <>
                    <Text style={styles.label}>Audit Sub-Type *</Text>
                    <TouchableOpacity style={styles.recipientPicker} onPress={() => setShowAuditSubTypePicker(!showAuditSubTypePicker)}>
                      <Text style={auditSubType ? styles.recipientSelected : styles.recipientPlaceholder}>{auditSubType || 'Select sub-type...'}</Text>
                      <Text style={styles.chevron}>{showAuditSubTypePicker ? '▲' : '▼'}</Text>
                    </TouchableOpacity>
                    {showAuditSubTypePicker && (
                      <View style={styles.recipientDropdown}>
                        {AUDIT_TYPES.map(a => (
                          <TouchableOpacity key={a} style={[styles.recipientOption, auditSubType === a && styles.recipientOptionActive]} onPress={() => { setAuditSubType(a); setShowAuditSubTypePicker(false) }}>
                            <Text style={[styles.recipientOptionText, auditSubType === a && { color: '#0d2818' }]}>{a}</Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                    )}

                    <Text style={styles.label}>Related Project</Text>
                    <TouchableOpacity style={styles.recipientPicker} onPress={() => setShowProjectPicker(!showProjectPicker)}>
                      <Text style={projectId ? styles.recipientSelected : styles.recipientPlaceholder}>
                        {projectId ? projects.find(p => p.id === projectId)?.name : 'Select project...'}
                      </Text>
                      <Text style={styles.chevron}>{showProjectPicker ? '▲' : '▼'}</Text>
                    </TouchableOpacity>
                    {showProjectPicker && (
                      <View style={styles.recipientDropdown}>
                        {projects.map(p => (
                          <TouchableOpacity key={p.id} style={[styles.recipientOption, projectId === p.id && styles.recipientOptionActive]} onPress={() => { setProjectId(p.id); setShowProjectPicker(false) }}>
                            <Text style={[styles.recipientOptionText, projectId === p.id && { color: '#0d2818' }]}>{p.name}</Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                    )}

                    <Text style={styles.label}>Period From</Text>
                    <TextInput style={styles.input} placeholder="YYYY-MM-DD" placeholderTextColor="#4a7a54" value={auditPeriodFrom} onChangeText={setAuditPeriodFrom} />

                    <Text style={styles.label}>Period To</Text>
                    <TextInput style={styles.input} placeholder="YYYY-MM-DD" placeholderTextColor="#4a7a54" value={auditPeriodTo} onChangeText={setAuditPeriodTo} />

                    <Text style={styles.label}>Scope / Departments</Text>
                    <TextInput style={[styles.input, styles.textarea]} placeholder="Describe the objectives and scope..." placeholderTextColor="#4a7a54" value={auditScope} onChangeText={setAuditScope} multiline numberOfLines={3} textAlignVertical="top" />

                    {(auditSubType === 'Compliance Review' || auditSubType === 'Regulatory Compliance Request') && (
                      <>
                        <Text style={styles.label}>Compliance Area / Topic</Text>
                        <TextInput style={styles.input} placeholder="e.g. Health & Safety, Financial Reporting" placeholderTextColor="#4a7a54" value={complianceArea} onChangeText={setComplianceArea} />

                        <Text style={styles.label}>Applicable Regulations</Text>
                        <TextInput style={styles.input} placeholder="e.g. OSHA, IFRS, Company Policy" placeholderTextColor="#4a7a54" value={complianceRegs} onChangeText={setComplianceRegs} />
                      </>
                    )}

                    {(auditSubType === 'Financial Review' || auditSubType === 'Operational Review') && (
                      <>
                        <Text style={styles.label}>Departments / Accounts in Scope</Text>
                        <TextInput style={styles.input} placeholder="e.g. Finance, Procurement, Operations" placeholderTextColor="#4a7a54" value={reviewDepts} onChangeText={setReviewDepts} />
                      </>
                    )}

                    {auditSubType === 'Internal Control Evaluation' && (
                      <>
                        <Text style={styles.label}>Control Area</Text>
                        <TextInput style={styles.input} placeholder="e.g. Procurement controls" placeholderTextColor="#4a7a54" value={controlArea} onChangeText={setControlArea} />
                      </>
                    )}

                    {auditSubType === 'Risk Assessment' && (
                      <>
                        <Text style={styles.label}>Risk Area / Domain</Text>
                        <TextInput style={styles.input} placeholder="e.g. Financial, Operational, Compliance" placeholderTextColor="#4a7a54" value={riskArea} onChangeText={setRiskArea} />

                        <Text style={styles.label}>Likelihood</Text>
                        <View style={styles.typeRow}>
                          {RISK_LEVELS.map(l => (
                            <TouchableOpacity key={l} style={[styles.typeBtn, riskLikelihood === l && styles.typeBtnActive]} onPress={() => setRiskLikelihood(l)}>
                              <Text style={[styles.typeBtnText, riskLikelihood === l && styles.typeBtnTextActive]}>{l}</Text>
                            </TouchableOpacity>
                          ))}
                        </View>

                        <Text style={styles.label}>Potential Impact</Text>
                        <View style={styles.typeRow}>
                          {RISK_LEVELS.map(l => (
                            <TouchableOpacity key={l} style={[styles.typeBtn, riskImpact === l && styles.typeBtnActive]} onPress={() => setRiskImpact(l)}>
                              <Text style={[styles.typeBtnText, riskImpact === l && styles.typeBtnTextActive]}>{l}</Text>
                            </TouchableOpacity>
                          ))}
                        </View>

                        <Text style={styles.label}>Proposed Mitigation Measures</Text>
                        <TextInput style={[styles.input, styles.textarea]} placeholder="Describe recommended mitigation actions..." placeholderTextColor="#4a7a54" value={riskMitigation} onChangeText={setRiskMitigation} multiline numberOfLines={3} textAlignVertical="top" />
                      </>
                    )}

                    {auditSubType === 'Fraud Investigation' && (
                      <>
                        <Text style={styles.label}>Incident Date</Text>
                        <TextInput style={styles.input} placeholder="YYYY-MM-DD" placeholderTextColor="#4a7a54" value={fraudIncidentDate} onChangeText={setFraudIncidentDate} />

                        <Text style={styles.label}>Parties Involved</Text>
                        <TextInput style={styles.input} placeholder="Names or departments involved" placeholderTextColor="#4a7a54" value={fraudParties} onChangeText={setFraudParties} />

                        <Text style={styles.label}>Evidence Reference</Text>
                        <TextInput style={styles.input} placeholder="Document/file reference numbers" placeholderTextColor="#4a7a54" value={fraudEvidence} onChangeText={setFraudEvidence} />
                      </>
                    )}
                  </>
                )}

                {requestType === 'Logistics Request' && (
                  <>
                    <Text style={styles.label}>Logistics Type *</Text>
                    <View style={styles.typeRow}>
                      {LOGISTICS_TYPES.map(l => (
                        <TouchableOpacity key={l} style={[styles.typeBtn, logisticsType === l && styles.typeBtnActive]} onPress={() => setLogisticsType(l)}>
                          <Text style={[styles.typeBtnText, logisticsType === l && styles.typeBtnTextActive]}>{l}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </>
                )}

                {logisticsType === 'Vehicle Request' && (
                  <>
                    <Text style={styles.label}>No. of Passengers</Text>
                    <TextInput style={styles.input} placeholder="0" placeholderTextColor="#4a7a54" value={vehPassengers} onChangeText={setVehPassengers} keyboardType="numeric" />

                    <Text style={styles.label}>Date Needed</Text>
                    <TextInput style={styles.input} placeholder="YYYY-MM-DD" placeholderTextColor="#4a7a54" value={vehDate} onChangeText={setVehDate} />

                    <Text style={styles.label}>Destination</Text>
                    <TextInput style={styles.input} placeholder="e.g. Cape Coast, Ghana" placeholderTextColor="#4a7a54" value={vehDest} onChangeText={setVehDest} />

                    <Text style={styles.label}>Purpose of Travel</Text>
                    <TextInput style={[styles.input, styles.textarea]} placeholder="Describe the purpose..." placeholderTextColor="#4a7a54" value={vehPurpose} onChangeText={setVehPurpose} multiline numberOfLines={3} textAlignVertical="top" />
                  </>
                )}

                {logisticsType === 'Accommodation Request' && (
                  <>
                    <Text style={styles.label}>Check-in Date</Text>
                    <TextInput style={styles.input} placeholder="YYYY-MM-DD" placeholderTextColor="#4a7a54" value={accCheckIn} onChangeText={setAccCheckIn} />

                    <Text style={styles.label}>Check-out Date</Text>
                    <TextInput style={styles.input} placeholder="YYYY-MM-DD" placeholderTextColor="#4a7a54" value={accCheckOut} onChangeText={setAccCheckOut} />

                    <Text style={styles.label}>Number of Guests</Text>
                    <TextInput style={styles.input} placeholder="0" placeholderTextColor="#4a7a54" value={accGuests} onChangeText={setAccGuests} keyboardType="numeric" />

                    <Text style={styles.label}>Location</Text>
                    <TextInput style={styles.input} placeholder="e.g. Accra" placeholderTextColor="#4a7a54" value={accLocation} onChangeText={setAccLocation} />
                  </>
                )}

                {logisticsType === 'Fuel Request' && (
                  <>
                    <Text style={styles.label}>Vehicle Registration</Text>
                    <TextInput style={styles.input} placeholder="e.g. GR-1234-24" placeholderTextColor="#4a7a54" value={fuelVehicle} onChangeText={setFuelVehicle} />

                    <Text style={styles.label}>Estimated Quantity (Litres)</Text>
                    <TextInput style={styles.input} placeholder="0" placeholderTextColor="#4a7a54" value={fuelQty} onChangeText={setFuelQty} keyboardType="numeric" />

                    <Text style={styles.label}>Purpose</Text>
                    <TextInput style={[styles.input, styles.textarea]} placeholder="Purpose of fuel request..." placeholderTextColor="#4a7a54" value={fuelPurpose} onChangeText={setFuelPurpose} multiline numberOfLines={3} textAlignVertical="top" />
                  </>
                )}

                {logisticsType === 'Travel Request' && (
                  <>
                    <Text style={styles.label}>Departure Date</Text>
                    <TextInput style={styles.input} placeholder="YYYY-MM-DD" placeholderTextColor="#4a7a54" value={travelFrom} onChangeText={setTravelFrom} />

                    <Text style={styles.label}>Return Date</Text>
                    <TextInput style={styles.input} placeholder="YYYY-MM-DD" placeholderTextColor="#4a7a54" value={travelTo} onChangeText={setTravelTo} />

                    <Text style={styles.label}>Destination</Text>
                    <TextInput style={styles.input} placeholder="e.g. Kumasi, Ghana" placeholderTextColor="#4a7a54" value={travelDest} onChangeText={setTravelDest} />

                    <Text style={styles.label}>Travel Purpose</Text>
                    <TextInput style={[styles.input, styles.textarea]} placeholder="Purpose of travel..." placeholderTextColor="#4a7a54" value={travelPurpose} onChangeText={setTravelPurpose} multiline numberOfLines={3} textAlignVertical="top" />
                  </>
                )}

                {logisticsType === 'Event Support Request' && (
                  <>
                    <Text style={styles.label}>Event Name</Text>
                    <TextInput style={styles.input} placeholder="Event name" placeholderTextColor="#4a7a54" value={eventName} onChangeText={setEventName} />

                    <Text style={styles.label}>Event Date</Text>
                    <TextInput style={styles.input} placeholder="YYYY-MM-DD" placeholderTextColor="#4a7a54" value={eventDate} onChangeText={setEventDate} />

                    <Text style={styles.label}>Expected Participants</Text>
                    <TextInput style={styles.input} placeholder="0" placeholderTextColor="#4a7a54" value={eventPax} onChangeText={setEventPax} keyboardType="numeric" />

                    <Text style={styles.label}>Logistics Requirements</Text>
                    <TextInput style={[styles.input, styles.textarea]} placeholder="What is needed for the event..." placeholderTextColor="#4a7a54" value={eventReqs} onChangeText={setEventReqs} multiline numberOfLines={3} textAlignVertical="top" />
                  </>
                )}

    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#0d2818' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, paddingBottom: 12 },
  headerTitle: { fontSize: 24, fontWeight: '800', color: '#ffffff' },
  newBtn: { backgroundColor: '#c9a84c', paddingHorizontal: 16, paddingVertical: 8, borderRadius: 8 },
  newBtnText: { color: '#0d2818', fontWeight: '700', fontSize: 14 },
  tabRow: { flexDirection: 'row', marginHorizontal: 16, marginBottom: 12, backgroundColor: '#102e1a', borderRadius: 10, padding: 4 },
  tabBtn: { flex: 1, paddingVertical: 8, alignItems: 'center', borderRadius: 8 },
  tabBtnActive: { backgroundColor: '#c9a84c' },
  tabText: { fontSize: 13, fontWeight: '600', color: '#6b8f71' },
  tabTextActive: { color: '#0d2818' },
  statsRow: { flexDirection: 'row', gap: 8, marginHorizontal: 16, marginBottom: 12 },
  statCard: { flex: 1, backgroundColor: '#102e1a', borderRadius: 10, padding: 12, borderTopWidth: 3, alignItems: 'center', borderWidth: 1, borderColor: '#1e4d2b' },
  statCardActive: { backgroundColor: '#1e4d2b' },
  statNum: { fontSize: 22, fontWeight: '800', color: '#ffffff' },
  statLabel: { fontSize: 11, color: '#6b8f71', marginTop: 2 },
  filterRow: { flexDirection: 'row', paddingHorizontal: 16, gap: 8, marginBottom: 8 },
  filterTab: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, borderWidth: 1, borderColor: '#1e4d2b' },
  filterTabActive: { backgroundColor: '#c9a84c', borderColor: '#c9a84c' },
  filterText: { fontSize: 12, color: '#6b8f71', fontWeight: '600' },
  filterTextActive: { color: '#0d2818' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  emptyIcon: { fontSize: 40, marginBottom: 12 },
  emptyText: { color: '#4a7a54', fontSize: 16 },
  card: { backgroundColor: '#102e1a', borderRadius: 12, padding: 16, borderWidth: 1, borderColor: '#1e4d2b' },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 },
  cardTitle: { fontSize: 15, fontWeight: '700', color: '#ffffff' },
  cardType: { fontSize: 11, color: '#c9a84c', marginTop: 2, textTransform: 'uppercase', letterSpacing: 1 },
  badge: { borderWidth: 1, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  badgeText: { fontSize: 10, fontWeight: '700' },
  cardDesc: { fontSize: 13, color: '#6b8f71', lineHeight: 19, marginBottom: 10 },
  cardMeta: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  metaText: { fontSize: 12, color: '#4a7a54' },
  priorityDot: { width: 8, height: 8, borderRadius: 4 },
  actionRow: { flexDirection: 'row', gap: 8 },
  actionBtn: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 14, paddingVertical: 10, alignItems: 'center' },
  actionBtnText: { fontSize: 13, fontWeight: '700' },
  detailHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 },
  detailRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 20 },
  detailValue: { fontSize: 15, color: '#ffffff', marginBottom: 16, lineHeight: 22 },
  closeBtn: { fontSize: 18, color: '#6b8f71', padding: 4 },
  modalOverlay: {
    position: 'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.6)',
    zIndex: 50,
  },
  modalKav: { flex: 1, justifyContent: 'flex-end' },
  modalCard: { backgroundColor: '#102e1a', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 24, paddingBottom: 48, maxHeight: '92%' },
  modalTitle: { fontSize: 20, fontWeight: '800', color: '#ffffff', marginBottom: 20 },
  label: { fontSize: 13, fontWeight: '600', color: '#c9a84c', marginBottom: 6 },
  recipientPicker: { backgroundColor: '#0d2818', borderWidth: 1, borderColor: '#1e4d2b', borderRadius: 10, padding: 12, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  recipientSelected: { color: '#ffffff', fontSize: 14 },
  recipientPlaceholder: { color: '#4a7a54', fontSize: 14 },
  chevron: { color: '#6b8f71', fontSize: 12 },
  recipientDropdown: { backgroundColor: '#0d2818', borderWidth: 1, borderColor: '#1e4d2b', borderRadius: 10, marginBottom: 16, maxHeight: 160, overflow: 'hidden' },
  recipientOption: { padding: 12, borderBottomWidth: 1, borderBottomColor: '#1e4d2b' },
  recipientOptionActive: { backgroundColor: '#c9a84c' },
  recipientOptionText: { color: '#ffffff', fontSize: 14 },
  typeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 },
  typeBtn: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, borderWidth: 1, borderColor: '#1e4d2b' },
  typeBtnActive: { backgroundColor: '#c9a84c', borderColor: '#c9a84c' },
  typeBtnText: { fontSize: 12, color: '#6b8f71', fontWeight: '600' },
  typeBtnTextActive: { color: '#0d2818' },
  input: { backgroundColor: '#0d2818', borderWidth: 1, borderColor: '#1e4d2b', borderRadius: 10, padding: 12, fontSize: 14, color: '#ffffff', marginBottom: 16 },
  textarea: { height: 100 },
  modalBtns: { flexDirection: 'row', gap: 12, marginTop: 8 },
  cancelBtn: { flex: 1, borderWidth: 1, borderColor: '#1e4d2b', borderRadius: 10, paddingVertical: 13, alignItems: 'center' },
  cancelBtnText: { color: '#6b8f71', fontWeight: '600' },
  submitBtn: { flex: 1, backgroundColor: '#c9a84c', borderRadius: 10, paddingVertical: 13, alignItems: 'center' },
  submitBtnText: { color: '#0d2818', fontWeight: '700', fontSize: 15 },
  closeBar: { marginTop: 24, backgroundColor: '#1e4d2b', borderRadius: 10, paddingVertical: 14, alignItems: 'center' },
  closeBarText: { color: '#ffffff', fontWeight: '700', fontSize: 15 },
})