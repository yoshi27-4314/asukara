/**
 * アスカラ - データベース層
 * Supabaseの接続・CRUD・リアルタイム同期
 */
import { CONFIG } from './config.js';

let db = null;
let realtimeChannel = null;
let listeners = new Set();

// --- 初期化 ---
export function initDB() {
  if (!window.supabase) {
    console.error('Supabase JS未読み込み');
    return false;
  }
  db = window.supabase.createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_KEY);

  // リアルタイム購読
  realtimeChannel = db.channel('asukara_realtime')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'ask_contacts' }, (payload) => {
      notifyListeners('ask_contacts', payload);
    })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'ask_cases' }, (payload) => {
      notifyListeners('ask_cases', payload);
    })
    .subscribe();

  return true;
}

export function getDB() { return db; }

// --- リアルタイムリスナー ---
export function subscribe(callback) {
  listeners.add(callback);
  return () => listeners.delete(callback);
}

function notifyListeners(table, payload) {
  for (const cb of listeners) {
    try { cb(table, payload); } catch (e) { console.error('Listener error:', e); }
  }
}

// =============================================
// 連絡先 (ask_contacts) CRUD
// =============================================

export async function getContacts(filters = {}) {
  if (!db) return [];
  let query = db.from('ask_contacts').select('*');

  if (filters.type) query = query.eq('type', filters.type);
  if (filters.organization_id) query = query.eq('organization_id', filters.organization_id);
  if (filters.search) {
    query = query.or(`name.ilike.%${filters.search}%,name_kana.ilike.%${filters.search}%,phone.ilike.%${filters.search}%,email.ilike.%${filters.search}%,note.ilike.%${filters.search}%,position.ilike.%${filters.search}%`);
  }

  query = query.order('updated_at', { ascending: false, nullsFirst: false });
  if (filters.limit) query = query.limit(filters.limit);
  if (filters.offset) query = query.range(filters.offset, filters.offset + (filters.limit || 50) - 1);

  const { data, error } = await query;
  if (error) { console.error('getContacts error:', error); return []; }
  return data || [];
}

export async function getContact(id) {
  if (!db) return null;
  const { data, error } = await db.from('ask_contacts').select('*').eq('id', id).single();
  if (error) { console.error('getContact error:', error); return null; }
  return data;
}

export async function createContact(contactData) {
  if (!db) return null;
  const { data, error } = await db.from('ask_contacts').insert(contactData).select().single();
  if (error) { console.error('createContact error:', error); return null; }
  // スプレッドシート同期（失敗してもアプリは止まらない）
  _syncToSheet('ask_sync_contact', 'create', { ...contactData, supabase_id: data.id });
  return data;
}

export async function updateContact(id, updates) {
  if (!db) return null;
  const { data, error } = await db.from('ask_contacts').update(updates).eq('id', id).select().single();
  if (error) { console.error('updateContact error:', error); return null; }
  _syncToSheet('ask_sync_contact', 'update', { ...updates, supabase_id: id });
  return data;
}

export async function deleteContact(id) {
  if (!db) return false;
  const { error } = await db.from('ask_contacts').delete().eq('id', id);
  if (error) { console.error('deleteContact error:', error); return false; }
  return true;
}

// =============================================
// 組織 (ask_organizations) CRUD
// =============================================

export async function getOrganizations(filters = {}) {
  if (!db) return [];
  let query = db.from('ask_organizations').select('*');

  if (filters.parent_id) query = query.eq('parent_id', filters.parent_id);
  if (filters.type) query = query.eq('type', filters.type);
  if (filters.search) {
    query = query.or(`name.ilike.%${filters.search}%`);
  }

  query = query.order('name', { ascending: true });
  const { data, error } = await query;
  if (error) { console.error('getOrganizations error:', error); return []; }
  return data || [];
}

export async function getOrganization(id) {
  if (!db) return null;
  const { data, error } = await db.from('ask_organizations').select('*').eq('id', id).single();
  if (error) { console.error('getOrganization error:', error); return null; }
  return data;
}

export async function createOrganization(orgData) {
  if (!db) return null;
  const { data, error } = await db.from('ask_organizations').insert(orgData).select().single();
  if (error) { console.error('createOrganization error:', error); return null; }
  return data;
}

export async function updateOrganization(id, updates) {
  if (!db) return null;
  const { data, error } = await db.from('ask_organizations').update(updates).eq('id', id).select().single();
  if (error) { console.error('updateOrganization error:', error); return null; }
  return data;
}

export async function getOrgChildren(parentId) {
  if (!db) return [];
  const { data, error } = await db.from('ask_organizations').select('*').eq('parent_id', parentId).order('name');
  if (error) { console.error('getOrgChildren error:', error); return []; }
  return data || [];
}

export async function getOrgContacts(orgId) {
  if (!db) return [];
  const { data, error } = await db.from('ask_contacts').select('*').eq('organization_id', orgId).order('name');
  if (error) { console.error('getOrgContacts error:', error); return []; }
  return data || [];
}

// =============================================
// 人間関係 (ask_relationships) CRUD
// =============================================

export async function getRelationships(contactId) {
  if (!db) return [];
  const { data, error } = await db.from('ask_relationships')
    .select('*')
    .or(`from_contact_id.eq.${contactId},to_contact_id.eq.${contactId}`)
    .order('created_at', { ascending: false });
  if (error) { console.error('getRelationships error:', error); return []; }
  return data || [];
}

export async function createRelationship(relData) {
  if (!db) return null;
  const { data, error } = await db.from('ask_relationships').insert(relData).select().single();
  if (error) { console.error('createRelationship error:', error); return null; }
  return data;
}

export async function deleteRelationship(id) {
  if (!db) return false;
  const { error } = await db.from('ask_relationships').delete().eq('id', id);
  if (error) { console.error('deleteRelationship error:', error); return false; }
  return true;
}

// =============================================
// 案件 (ask_cases) CRUD
// =============================================

export async function getCases(filters = {}) {
  if (!db) return [];
  let query = db.from('ask_cases').select('*');

  if (filters.status) {
    if (Array.isArray(filters.status)) {
      query = query.in('status', filters.status);
    } else {
      query = query.eq('status', filters.status);
    }
  }
  if (filters.staff_id) query = query.eq('staff_id', filters.staff_id);
  if (filters.contact_id) query = query.eq('contact_id', filters.contact_id);
  if (filters.search) {
    query = query.or(`title.ilike.%${filters.search}%,description.ilike.%${filters.search}%,note.ilike.%${filters.search}%,site_address.ilike.%${filters.search}%,category.ilike.%${filters.search}%`);
  }

  query = query.order('updated_at', { ascending: false, nullsFirst: false });
  if (filters.limit) query = query.limit(filters.limit);
  if (filters.offset) query = query.range(filters.offset, filters.offset + (filters.limit || 50) - 1);

  const { data, error } = await query;
  if (error) { console.error('getCases error:', error); return []; }
  return data || [];
}

export async function getCase(id) {
  if (!db) return null;
  const { data, error } = await db.from('ask_cases').select('*').eq('id', id).single();
  if (error) { console.error('getCase error:', error); return null; }
  return data;
}

export async function createCase(caseData) {
  if (!db) return null;
  const { data, error } = await db.from('ask_cases').insert(caseData).select().single();
  if (error) { console.error('createCase error:', error); return null; }
  _syncToSheet('ask_sync_case', 'create', { ...caseData, supabase_id: data.id });
  return data;
}

export async function updateCase(id, updates) {
  if (!db) return null;
  const { data, error } = await db.from('ask_cases').update(updates).eq('id', id).select().single();
  if (error) { console.error('updateCase error:', error); return null; }
  _syncToSheet('ask_sync_case', 'update', { ...updates, supabase_id: id });
  return data;
}

export async function deleteCase(id) {
  if (!db) return false;
  const { error } = await db.from('ask_cases').delete().eq('id', id);
  if (error) { console.error('deleteCase error:', error); return false; }
  return true;
}

// =============================================
// 案件履歴 (ask_case_history)
// =============================================

export async function getCaseHistory(caseId) {
  if (!db) return [];
  const { data, error } = await db.from('ask_case_history')
    .select('*')
    .eq('case_id', caseId)
    .order('created_at', { ascending: false });
  if (error) { console.error('getCaseHistory error:', error); return []; }
  return data || [];
}

export async function addCaseHistory(historyData) {
  if (!db) return null;
  const { data, error } = await db.from('ask_case_history').insert(historyData).select().single();
  if (error) { console.error('addCaseHistory error:', error); return null; }
  return data;
}

// =============================================
// 案件×事業部 (ask_case_divisions)
// =============================================

export async function getCaseDivisions(caseId) {
  if (!db) return [];
  const { data, error } = await db.from('ask_case_divisions')
    .select('*')
    .eq('case_id', caseId)
    .order('created_at', { ascending: true });
  if (error) { console.error('getCaseDivisions error:', error); return []; }
  return data || [];
}

export async function setCaseDivisions(caseId, divisions) {
  if (!db) return false;

  // 既存を削除
  const { error: delError } = await db.from('ask_case_divisions').delete().eq('case_id', caseId);
  if (delError) { console.error('setCaseDivisions delete error:', delError); return false; }

  // 新しい事業部を挿入
  if (divisions && divisions.length > 0) {
    const rows = divisions.map(div => ({
      case_id: caseId,
      division: div.division,
      role: div.role || '並列',
      note: div.note || null,
    }));
    const { error: insError } = await db.from('ask_case_divisions').insert(rows);
    if (insError) { console.error('setCaseDivisions insert error:', insError); return false; }
  }

  return true;
}

// =============================================
// 統計
// =============================================

export async function getCaseStatusCounts() {
  if (!db) return {};
  const counts = {};
  let total = 0;
  let offset = 0;
  const pageSize = 1000;

  while (true) {
    const { data, error } = await db.from('ask_cases').select('status').range(offset, offset + pageSize - 1);
    if (error || !data || data.length === 0) break;
    for (const c of data) {
      counts[c.status] = (counts[c.status] || 0) + 1;
      total++;
    }
    if (data.length < pageSize) break;
    offset += pageSize;
  }

  counts._total = total;
  return counts;
}

export async function getContactStats() {
  if (!db) return {};
  const counts = {};
  let offset = 0;
  const pageSize = 1000;

  while (true) {
    const { data, error } = await db.from('ask_contacts').select('type').range(offset, offset + pageSize - 1);
    if (error || !data || data.length === 0) break;
    for (const c of data) {
      counts[c.type] = (counts[c.type] || 0) + 1;
    }
    if (data.length < pageSize) break;
    offset += pageSize;
  }

  return counts;
}

// =============================================
// 接点記録 (ask_touchpoints)
// =============================================

export async function getTouchpoints(contactId, limit = 50) {
  if (!db) return [];
  const { data, error } = await db.from('ask_touchpoints')
    .select('*')
    .eq('contact_id', contactId)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) { console.error('getTouchpoints error:', error); return []; }
  return data || [];
}

export async function getRecentTouchpoints(limit = 20) {
  if (!db) return [];
  const { data, error } = await db.from('ask_touchpoints')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) { console.error('getRecentTouchpoints error:', error); return []; }
  return data || [];
}

export async function createTouchpoint(tpData) {
  if (!db) return null;
  const { data, error } = await db.from('ask_touchpoints').insert(tpData).select().single();
  if (error) { console.error('createTouchpoint error:', error); return null; }
  return data;
}

export async function getTouchpointStats(contactId) {
  if (!db) return { total: 0, cases: 0, referrals: 0 };
  const { data, error } = await db.from('ask_touchpoints')
    .select('type,case_id,referred_contact_id')
    .eq('contact_id', contactId);
  if (error) return { total: 0, cases: 0, referrals: 0 };
  const items = data || [];
  return {
    total: items.length,
    cases: items.filter(t => t.case_id).length,
    referrals: items.filter(t => t.type === '紹介').length,
  };
}

// =============================================
// スプレッドシート同期（バックグラウンド・失敗してもアプリは止まらない）
// =============================================
function _syncToSheet(action, mode, data) {
  try {
    fetch(CONFIG.GAS_SYNC_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, mode, data }),
      mode: 'no-cors',
    }).catch(err => console.warn('Sheet sync failed (non-blocking):', err));
  } catch (e) {
    console.warn('Sheet sync error (non-blocking):', e);
  }
}
