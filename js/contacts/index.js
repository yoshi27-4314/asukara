/**
 * アスカラ - 人間関係モジュール
 * 接点タイムライン中心。全ての出会い・会話・紹介が蓄積される。
 */
import { CONFIG } from '../core/config.js';
import {
  getContacts, getContact, createContact, updateContact,
  getOrganizations, getOrganization, createOrganization,
  getOrgContacts,
  getRelationships, createRelationship, deleteRelationship,
  getCases,
  getTouchpoints, getRecentTouchpoints, createTouchpoint, getTouchpointStats
} from '../core/db.js';
import { showToast, showLoading, showConfirm, emptyState, escapeHtml, contactTypeBadge, formatDate, formatDateTime } from '../core/ui.js';
import { getCurrentStaff } from '../core/auth.js';
import { navigate } from '../core/router.js';

// 接点タイプ定義
const TP_TYPES = [
  { id: '電話', icon: '📞', color: '#1B3A5C' },
  { id: '訪問', icon: '📍', color: '#0D7377' },
  { id: 'メール', icon: '✉️', color: '#6366F1' },
  { id: '紹介', icon: '🤝', color: '#B8860B' },
  { id: '案件', icon: '📋', color: '#2563EB' },
  { id: '入金', icon: '💰', color: '#059669' },
  { id: 'お礼', icon: '🎁', color: '#D97706' },
  { id: '名刺交換', icon: '📇', color: '#7C3AED' },
  { id: 'その他', icon: '📝', color: '#6B7280' },
];

// ============================================================
// メインエントリ
// ============================================================
export function renderContacts(container, params = {}) {
  if (params.action === 'detail' && params.id) {
    renderPersonDetail(container, params.id);
  } else if (params.action === 'new') {
    renderPersonForm(container);
  } else if (params.action === 'record') {
    renderRecordTouchpoint(container, params);
  } else if (params.action === 'org' && params.id) {
    renderOrgDetail(container, params.id);
  } else {
    renderTop(container);
  }
}

// ============================================================
// トップ画面（最近の接点 + 検索）
// ============================================================
async function renderTop(container) {
  showLoading(container, '読み込み中...');

  const recentTPs = await getRecentTouchpoints(15);

  // 接点に紐付く人の名前を取得
  const contactCache = {};
  for (const tp of recentTPs) {
    if (tp.contact_id && !contactCache[tp.contact_id]) {
      contactCache[tp.contact_id] = await getContact(tp.contact_id);
    }
  }

  container.innerHTML = `
    <div class="fade-in">
      <!-- 検索 -->
      <div style="margin-bottom:12px;">
        <input type="search" id="searchInput" placeholder="名前・会社・電話で検索..."
          style="width:100%;padding:12px 14px;border:1px solid #D6D3CB;border-radius:10px;font-size:15px;background:#fff;">
      </div>
      <div id="searchResults" style="display:none;margin-bottom:12px;"></div>

      <!-- 最近の接点 -->
      <div id="recentSection">
        <div style="font-size:13px;font-weight:700;color:#5a6272;margin-bottom:8px;">最近の接点</div>
        ${recentTPs.length > 0 ? recentTPs.map(tp => {
          const person = contactCache[tp.contact_id];
          const tpType = TP_TYPES.find(t => t.id === tp.type) || TP_TYPES[8];
          return `
            <div data-person-id="${tp.contact_id}" style="background:#fff;border-radius:10px;padding:12px;margin-bottom:6px;border:1px solid #D6D3CB;border-left:3px solid ${tpType.color};cursor:pointer;">
              <div style="display:flex;justify-content:space-between;align-items:flex-start;">
                <div>
                  <span style="font-size:13px;">${tpType.icon}</span>
                  <span style="font-weight:700;font-size:14px;margin-left:4px;">${escapeHtml(person?.name || '不明')}</span>
                  ${person?.organization_id ? '' : ''}
                </div>
                <span style="font-size:11px;color:#8a8a8a;">${formatDate(tp.created_at)}</span>
              </div>
              ${tp.note ? `<div style="font-size:12px;color:#5a6272;margin-top:4px;margin-left:22px;">${escapeHtml(tp.note.substring(0, 60))}${tp.note.length > 60 ? '...' : ''}</div>` : ''}
            </div>
          `;
        }).join('') : `
          <div style="text-align:center;padding:40px;color:#8a8a8a;">
            <div style="font-size:40px;margin-bottom:8px;">🤝</div>
            <div style="font-size:14px;">接点を記録しましょう</div>
            <div style="font-size:12px;margin-top:4px;">電話・訪問・紹介、全てが資産になります</div>
          </div>
        `}
      </div>

      <!-- FAB -->
      <div style="position:fixed;bottom:80px;right:16px;display:flex;flex-direction:column;gap:10px;z-index:50;">
        <button id="btnOcr" style="width:48px;height:48px;border-radius:50%;background:#7C3AED;color:#fff;border:none;font-size:20px;cursor:pointer;box-shadow:0 4px 12px rgba(124,58,237,0.3);display:flex;align-items:center;justify-content:center;">📷</button>
        <button id="btnRecord" style="width:56px;height:56px;border-radius:50%;background:#B8860B;color:#fff;border:none;font-size:24px;cursor:pointer;box-shadow:0 4px 12px rgba(184,134,11,0.3);display:flex;align-items:center;justify-content:center;">＋</button>
      </div>
    </div>
  `;

  // 接点カードタップ → 人の詳細
  container.querySelectorAll('[data-person-id]').forEach(el => {
    el.addEventListener('click', () => renderPersonDetail(container, el.dataset.personId));
  });

  // 検索
  let searchTimer = null;
  const searchInput = container.querySelector('#searchInput');
  const searchResults = container.querySelector('#searchResults');
  const recentSection = container.querySelector('#recentSection');

  searchInput?.addEventListener('input', () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(async () => {
      const q = searchInput.value.trim();
      if (q.length >= 1) {
        const results = await getContacts({ search: q, limit: 20 });
        const filtered = results.filter(c => !(c.tags && c.tags.includes('削除済み')));
        searchResults.style.display = 'block';
        recentSection.style.display = 'none';

        searchResults.innerHTML = filtered.length > 0 ? filtered.map(c => `
          <div data-result-id="${c.id}" style="background:#fff;border-radius:10px;padding:12px;margin-bottom:6px;border:1px solid #D6D3CB;cursor:pointer;">
            <div style="display:flex;justify-content:space-between;align-items:center;">
              <div>
                <span style="font-weight:700;font-size:14px;">${escapeHtml(c.name)}</span>
                ${c.phone ? `<span style="font-size:11px;color:#8a8a8a;margin-left:8px;">📞${escapeHtml(c.phone)}</span>` : ''}
              </div>
              ${contactTypeBadge(c.type)}
            </div>
          </div>
        `).join('') : '<div style="padding:12px;text-align:center;color:#8a8a8a;">見つかりません</div>';

        searchResults.querySelectorAll('[data-result-id]').forEach(el => {
          el.addEventListener('click', () => renderPersonDetail(container, el.dataset.resultId));
        });
      } else {
        searchResults.style.display = 'none';
        recentSection.style.display = 'block';
      }
    }, 300);
  });

  // FABボタン
  container.querySelector('#btnRecord')?.addEventListener('click', () => renderRecordTouchpoint(container, {}));
  container.querySelector('#btnOcr')?.addEventListener('click', () => renderOcr(container));
}

// ============================================================
// 接点を記録
// ============================================================
async function renderRecordTouchpoint(container, params = {}) {
  const contacts = await getContacts({ limit: 700 });
  const cases = await getCases({ limit: 50 });

  container.innerHTML = `
    <div class="fade-in">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:16px;">
        <button id="btnBack" style="padding:6px 12px;border:1px solid #D6D3CB;border-radius:8px;background:#fff;cursor:pointer;">← 戻る</button>
        <div style="font-size:15px;font-weight:700;">接点を記録</div>
      </div>

      <div style="background:#fff;border-radius:12px;padding:16px;border:1px solid #D6D3CB;">
        <!-- 誰と -->
        <div class="form-group">
          <label>誰と？ *</label>
          <input type="text" id="tpContactSearch" placeholder="名前で検索...">
          <div id="tpContactResults" style="max-height:150px;overflow-y:auto;margin-top:4px;"></div>
          <input type="hidden" id="tpContactId" value="${params.contactId || ''}">
          <div id="tpContactSelected" style="margin-top:4px;font-size:13px;color:#0D7377;font-weight:600;">${params.contactName || ''}</div>
        </div>

        <!-- 何があった -->
        <div class="form-group">
          <label>何があった？ *</label>
          <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-top:4px;">
            ${TP_TYPES.map(t => `
              <button class="tpTypeBtn" data-type="${t.id}"
                style="padding:10px 4px;border:2px solid #D6D3CB;border-radius:10px;background:#fff;cursor:pointer;text-align:center;transition:all 0.15s;">
                <div style="font-size:20px;">${t.icon}</div>
                <div style="font-size:10px;color:#5a6272;margin-top:2px;">${t.id}</div>
              </button>
            `).join('')}
          </div>
          <input type="hidden" id="tpType">
        </div>

        <!-- 紹介先（紹介選択時のみ） -->
        <div id="tpReferralSection" style="display:none;" class="form-group">
          <label>誰を紹介？</label>
          <input type="text" id="tpRefSearch" placeholder="紹介先の名前...">
          <div id="tpRefResults" style="max-height:120px;overflow-y:auto;margin-top:4px;"></div>
          <input type="hidden" id="tpRefId">
          <div id="tpRefSelected" style="margin-top:4px;font-size:13px;color:#B8860B;font-weight:600;"></div>
        </div>

        <!-- メモ -->
        <div class="form-group">
          <label>メモ（任意）</label>
          <textarea id="tpNote" placeholder="内容をメモ..." style="min-height:60px;"></textarea>
        </div>

        <!-- 案件紐付け -->
        <div class="form-group">
          <label>案件に紐付け（任意）</label>
          <select id="tpCaseId" style="width:100%;padding:10px;border:1px solid #D6D3CB;border-radius:8px;font-size:14px;">
            <option value="">紐付けない</option>
            ${cases.filter(c => c.status !== '削除済み' && c.status !== 'アーカイブ').map(c => `
              <option value="${c.id}">${escapeHtml(c.title)}</option>
            `).join('')}
          </select>
        </div>

        <button id="btnSaveTp" style="width:100%;padding:14px;border-radius:8px;background:#B8860B;color:#fff;border:none;font-size:15px;font-weight:700;cursor:pointer;">記録する</button>
      </div>
    </div>
  `;

  // 誰と検索
  _setupSearch('tpContactSearch', 'tpContactResults', 'tpContactId', 'tpContactSelected', contacts);
  _setupSearch('tpRefSearch', 'tpRefResults', 'tpRefId', 'tpRefSelected', contacts);

  // タイプ選択
  container.querySelectorAll('.tpTypeBtn').forEach(btn => {
    btn.addEventListener('click', () => {
      container.querySelectorAll('.tpTypeBtn').forEach(b => { b.style.borderColor = '#D6D3CB'; b.style.background = '#fff'; });
      const type = btn.dataset.type;
      const tpDef = TP_TYPES.find(t => t.id === type);
      btn.style.borderColor = tpDef?.color || '#B8860B';
      btn.style.background = (tpDef?.color || '#B8860B') + '10';
      document.getElementById('tpType').value = type;

      // 紹介の場合のみ紹介先を表示
      document.getElementById('tpReferralSection').style.display = type === '紹介' ? 'block' : 'none';
    });
  });

  container.querySelector('#btnBack')?.addEventListener('click', () => renderTop(container));

  container.querySelector('#btnSaveTp')?.addEventListener('click', async () => {
    const contactId = document.getElementById('tpContactId').value;
    const type = document.getElementById('tpType').value;
    if (!contactId) { showToast('相手を選んでください'); return; }
    if (!type) { showToast('種類を選んでください'); return; }

    const staff = getCurrentStaff();
    const tpData = {
      contact_id: contactId,
      type,
      note: document.getElementById('tpNote').value.trim() || null,
      case_id: document.getElementById('tpCaseId').value || null,
      referred_contact_id: type === '紹介' ? (document.getElementById('tpRefId').value || null) : null,
      recorded_by: staff?.name || null,
    };

    const result = await createTouchpoint(tpData);
    if (result) {
      // 紹介の場合、relationshipも自動作成
      if (type === '紹介' && tpData.referred_contact_id) {
        await createRelationship({
          from_contact_id: contactId,
          to_contact_id: tpData.referred_contact_id,
          type: '紹介',
          note: tpData.note,
        });
      }
      showToast('記録しました');
      renderPersonDetail(container, contactId);
    } else {
      showToast('記録に失敗しました');
    }
  });
}

// ============================================================
// 人の詳細（タイムライン中心）
// ============================================================
async function renderPersonDetail(container, contactId) {
  showLoading(container, '読み込み中...');

  const [person, touchpoints, relationships, stats, org] = await Promise.all([
    getContact(contactId),
    getTouchpoints(contactId, 30),
    getRelationships(contactId),
    getTouchpointStats(contactId),
    null,
  ]);

  if (!person) {
    container.innerHTML = emptyState('❌', '見つかりません');
    return;
  }

  // 所属組織
  let orgName = '';
  if (person.organization_id) {
    const o = await getOrganization(person.organization_id);
    orgName = o?.name || '';
  }

  // 関係先の名前取得
  const relContacts = [];
  for (const rel of relationships) {
    const otherId = rel.from_contact_id === contactId ? rel.to_contact_id : rel.from_contact_id;
    const other = await getContact(otherId);
    if (other) {
      const direction = rel.from_contact_id === contactId ? '→' : '←';
      relContacts.push({ ...rel, otherName: other.name, otherId, direction });
    }
  }

  // 関連案件
  const cases = await getCases({ contact_id: contactId, limit: 5 });

  container.innerHTML = `
    <div class="fade-in">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:12px;">
        <button id="btnBack" style="padding:6px 12px;border:1px solid #D6D3CB;border-radius:8px;background:#fff;cursor:pointer;">← 戻る</button>
        <div style="flex:1;"></div>
        <button id="btnEdit" style="padding:6px 12px;border:1px solid #B8860B;border-radius:8px;background:#fff;color:#B8860B;cursor:pointer;font-size:13px;">編集</button>
        <button id="btnDelete" style="padding:6px 12px;border:1px solid #DC2626;border-radius:8px;background:#fff;color:#DC2626;cursor:pointer;font-size:13px;">削除</button>
      </div>

      <!-- 基本情報 -->
      <div style="background:#fff;border-radius:12px;padding:16px;border:1px solid #D6D3CB;margin-bottom:12px;">
        <div style="font-size:20px;font-weight:700;margin-bottom:4px;">${escapeHtml(person.name)}</div>
        ${orgName ? `<div style="font-size:13px;color:#0D7377;margin-bottom:4px;cursor:pointer;" id="orgLink">🏢 ${escapeHtml(orgName)}${person.position ? ' · ' + escapeHtml(person.position) : ''}</div>` : ''}
        ${person.phone ? `<div style="font-size:13px;color:#5a6272;">📞 ${escapeHtml(person.phone)}</div>` : ''}
        ${person.email ? `<div style="font-size:13px;color:#5a6272;">✉️ ${escapeHtml(person.email)}</div>` : ''}
      </div>

      <!-- この人の数字 -->
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-bottom:12px;">
        <div style="background:#fff;border-radius:10px;padding:12px;text-align:center;border:1px solid #D6D3CB;">
          <div style="font-size:22px;font-weight:700;color:#1B3A5C;">${stats.total}</div>
          <div style="font-size:10px;color:#8a8a8a;">接点</div>
        </div>
        <div style="background:#fff;border-radius:10px;padding:12px;text-align:center;border:1px solid #D6D3CB;">
          <div style="font-size:22px;font-weight:700;color:#0D7377;">${cases.length}</div>
          <div style="font-size:10px;color:#8a8a8a;">案件</div>
        </div>
        <div style="background:#fff;border-radius:10px;padding:12px;text-align:center;border:1px solid #D6D3CB;">
          <div style="font-size:22px;font-weight:700;color:#B8860B;">${stats.referrals}</div>
          <div style="font-size:10px;color:#8a8a8a;">紹介</div>
        </div>
      </div>

      <!-- タイムライン -->
      <div style="background:#fff;border-radius:12px;padding:16px;border:1px solid #D6D3CB;margin-bottom:12px;">
        <div style="font-size:13px;font-weight:700;color:#5a6272;margin-bottom:10px;">🕐 タイムライン</div>
        ${touchpoints.length > 0 ? touchpoints.map(tp => {
          const tpDef = TP_TYPES.find(t => t.id === tp.type) || TP_TYPES[8];
          return `
            <div style="display:flex;gap:10px;padding:8px 0;border-bottom:1px solid #f0f0f0;">
              <div style="width:28px;height:28px;border-radius:50%;background:${tpDef.color}14;display:flex;align-items:center;justify-content:center;font-size:14px;flex-shrink:0;">${tpDef.icon}</div>
              <div style="flex:1;">
                <div style="font-size:12px;color:#8a8a8a;">${formatDateTime(tp.created_at)} · ${escapeHtml(tp.type)}</div>
                ${tp.note ? `<div style="font-size:13px;margin-top:2px;">${escapeHtml(tp.note)}</div>` : ''}
              </div>
            </div>
          `;
        }).join('') : '<div style="font-size:12px;color:#8a8a8a;text-align:center;padding:12px;">接点はまだ記録されていません</div>'}
      </div>

      <!-- つながり -->
      <div style="background:#fff;border-radius:12px;padding:16px;border:1px solid #D6D3CB;margin-bottom:12px;">
        <div style="font-size:13px;font-weight:700;color:#B8860B;margin-bottom:10px;">🤝 つながり</div>
        ${relContacts.length > 0 ? relContacts.map(r => `
          <div data-rel-person="${r.otherId}" style="padding:8px 0;border-bottom:1px solid #f0f0f0;cursor:pointer;">
            <span style="font-weight:600;">${escapeHtml(r.otherName)}</span>
            <span style="font-size:11px;color:#B8860B;margin-left:6px;">${r.direction} ${escapeHtml(r.type)}</span>
          </div>
        `).join('') : '<div style="font-size:12px;color:#8a8a8a;">つながりはまだありません</div>'}
        <button id="btnAddRel" style="width:100%;padding:8px;border:1px dashed #D6D3CB;border-radius:8px;background:transparent;color:#0D7377;font-size:12px;cursor:pointer;margin-top:8px;">＋ つながりを追加</button>
      </div>

      <!-- この人との接点を記録 -->
      <button id="btnRecordTp" style="width:100%;padding:14px;border-radius:8px;background:#B8860B;color:#fff;border:none;font-size:15px;font-weight:700;cursor:pointer;margin-bottom:16px;">＋ この人との接点を記録</button>
    </div>
  `;

  // イベント
  container.querySelector('#btnBack')?.addEventListener('click', () => renderTop(container));
  container.querySelector('#btnEdit')?.addEventListener('click', () => renderPersonForm(container, person));
  container.querySelector('#btnDelete')?.addEventListener('click', () => {
    showConfirm(`「${person.name}」を削除済みにしますか？`, async () => {
      await updateContact(person.id, { tags: [...(person.tags || []), '削除済み'] });
      showToast('削除済みにしました');
      renderTop(container);
    });
  });
  container.querySelector('#orgLink')?.addEventListener('click', () => {
    if (person.organization_id) renderOrgDetail(container, person.organization_id);
  });
  container.querySelectorAll('[data-rel-person]').forEach(el => {
    el.addEventListener('click', () => renderPersonDetail(container, el.dataset.relPerson));
  });
  container.querySelector('#btnAddRel')?.addEventListener('click', () => renderAddRelationship(container, person));
  container.querySelector('#btnRecordTp')?.addEventListener('click', () => {
    renderRecordTouchpoint(container, { contactId: person.id, contactName: person.name });
  });
}

// ============================================================
// 人の登録/編集
// ============================================================
async function renderPersonForm(container, existing = null) {
  const orgs = await getOrganizations();
  const isEdit = !!existing;

  container.innerHTML = `
    <div class="fade-in">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:16px;">
        <button id="btnBack" style="padding:6px 12px;border:1px solid #D6D3CB;border-radius:8px;background:#fff;cursor:pointer;">← 戻る</button>
        <div style="font-size:15px;font-weight:700;">${isEdit ? '編集' : '新しい人を登録'}</div>
      </div>
      <div style="background:#fff;border-radius:12px;padding:16px;border:1px solid #D6D3CB;">
        <div class="form-group">
          <label>氏名 *</label>
          <input type="text" id="fName" value="${escapeHtml(existing?.name || '')}" placeholder="山田 太郎">
        </div>
        <div class="form-group">
          <label>ふりがな</label>
          <input type="text" id="fKana" value="${escapeHtml(existing?.name_kana || '')}" placeholder="やまだ たろう">
        </div>
        <div class="form-group">
          <label>種類</label>
          <select id="fType">
            ${CONFIG.CONTACT_TYPES.map(t => `<option value="${t}" ${existing?.type === t ? 'selected' : ''}>${t}</option>`).join('')}
          </select>
        </div>
        <div class="form-group">
          <label>電話番号</label>
          <input type="tel" id="fPhone" value="${escapeHtml(existing?.phone || '')}" placeholder="090-1234-5678">
        </div>
        <div class="form-group">
          <label>メール</label>
          <input type="email" id="fEmail" value="${escapeHtml(existing?.email || '')}" placeholder="example@email.com">
        </div>
        <div class="form-group">
          <label>所属組織</label>
          <select id="fOrg">
            <option value="">なし</option>
            ${orgs.map(o => `<option value="${o.id}" ${existing?.organization_id === o.id ? 'selected' : ''}>${escapeHtml(o.name)}</option>`).join('')}
          </select>
        </div>
        <div class="form-group">
          <label>役職</label>
          <input type="text" id="fPosition" value="${escapeHtml(existing?.position || '')}" placeholder="部長">
        </div>
        <div class="form-group">
          <label>メモ</label>
          <textarea id="fNote" placeholder="備考...">${escapeHtml(existing?.note || '')}</textarea>
        </div>
        <button id="btnSave" style="width:100%;padding:12px;border-radius:8px;background:#1B3A5C;color:#fff;border:none;font-size:14px;font-weight:600;cursor:pointer;">${isEdit ? '更新する' : '登録する'}</button>
      </div>
    </div>
  `;

  container.querySelector('#btnBack')?.addEventListener('click', () => {
    if (isEdit) renderPersonDetail(container, existing.id);
    else renderTop(container);
  });

  container.querySelector('#btnSave')?.addEventListener('click', async () => {
    const name = document.getElementById('fName').value.trim();
    if (!name) { showToast('氏名は必須です'); return; }
    const data = {
      name,
      name_kana: document.getElementById('fKana').value.trim() || null,
      type: document.getElementById('fType').value,
      phone: document.getElementById('fPhone').value.trim() || null,
      email: document.getElementById('fEmail').value.trim() || null,
      organization_id: document.getElementById('fOrg').value || null,
      position: document.getElementById('fPosition').value.trim() || null,
      note: document.getElementById('fNote').value.trim() || null,
    };
    if (!isEdit) data.registered_by = getCurrentStaff()?.name || null;

    if (isEdit) {
      await updateContact(existing.id, data);
      showToast('更新しました');
      renderPersonDetail(container, existing.id);
    } else {
      const result = await createContact(data);
      if (result) {
        showToast('登録しました');
        renderPersonDetail(container, result.id);
      } else {
        showToast('登録に失敗しました');
      }
    }
  });
}

// ============================================================
// 組織詳細
// ============================================================
async function renderOrgDetail(container, orgId) {
  showLoading(container, '読み込み中...');
  const [org, members] = await Promise.all([
    getOrganization(orgId),
    getOrgContacts(orgId),
  ]);
  if (!org) { container.innerHTML = emptyState('❌', '組織が見つかりません'); return; }

  container.innerHTML = `
    <div class="fade-in">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:12px;">
        <button id="btnBack" style="padding:6px 12px;border:1px solid #D6D3CB;border-radius:8px;background:#fff;cursor:pointer;">← 戻る</button>
      </div>
      <div style="background:#fff;border-radius:12px;padding:16px;border:1px solid #D6D3CB;margin-bottom:12px;">
        <div style="font-size:18px;font-weight:700;">🏢 ${escapeHtml(org.name)}</div>
        ${org.address ? `<div style="font-size:13px;color:#5a6272;margin-top:4px;">📍 ${escapeHtml(org.address)}</div>` : ''}
        ${org.phone ? `<div style="font-size:13px;color:#5a6272;">📞 ${escapeHtml(org.phone)}</div>` : ''}
      </div>
      <div style="background:#fff;border-radius:12px;padding:16px;border:1px solid #D6D3CB;">
        <div style="font-size:13px;font-weight:700;color:#5a6272;margin-bottom:8px;">👥 所属メンバー（${members.length}人）</div>
        ${members.length > 0 ? members.map(m => `
          <div data-member-id="${m.id}" style="padding:8px 0;border-bottom:1px solid #f0f0f0;cursor:pointer;">
            <span style="font-weight:600;">${escapeHtml(m.name)}</span>
            ${m.position ? `<span style="font-size:11px;color:#8a8a8a;margin-left:8px;">${escapeHtml(m.position)}</span>` : ''}
          </div>
        `).join('') : '<div style="font-size:12px;color:#8a8a8a;">メンバーはいません</div>'}
      </div>
    </div>
  `;

  container.querySelector('#btnBack')?.addEventListener('click', () => renderTop(container));
  container.querySelectorAll('[data-member-id]').forEach(el => {
    el.addEventListener('click', () => renderPersonDetail(container, el.dataset.memberId));
  });
}

// ============================================================
// つながり追加
// ============================================================
async function renderAddRelationship(container, fromPerson) {
  const contacts = await getContacts({ limit: 500 });

  container.innerHTML = `
    <div class="fade-in">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:16px;">
        <button id="btnBack" style="padding:6px 12px;border:1px solid #D6D3CB;border-radius:8px;background:#fff;cursor:pointer;">← 戻る</button>
        <div style="font-size:15px;font-weight:700;">つながりを追加</div>
      </div>
      <div style="background:#fff;border-radius:12px;padding:16px;border:1px solid #D6D3CB;">
        <div style="font-size:13px;color:#5a6272;margin-bottom:12px;"><strong>${escapeHtml(fromPerson.name)}</strong> と...</div>
        <div class="form-group">
          <label>相手 *</label>
          <input type="text" id="relSearch" placeholder="名前で検索...">
          <div id="relResults" style="max-height:150px;overflow-y:auto;margin-top:4px;"></div>
          <input type="hidden" id="relToId">
        </div>
        <div class="form-group">
          <label>関係</label>
          <select id="relType">
            ${CONFIG.RELATIONSHIP_TYPES.map(t => `<option value="${t}">${t}</option>`).join('')}
          </select>
        </div>
        <div class="form-group">
          <label>メモ（任意）</label>
          <textarea id="relNote" placeholder="関係の詳細..."></textarea>
        </div>
        <button id="btnSaveRel" style="width:100%;padding:12px;border-radius:8px;background:#1B3A5C;color:#fff;border:none;font-size:14px;font-weight:600;cursor:pointer;">登録する</button>
      </div>
    </div>
  `;

  _setupSearch('relSearch', 'relResults', 'relToId', null, contacts.filter(c => c.id !== fromPerson.id));

  container.querySelector('#btnBack')?.addEventListener('click', () => renderPersonDetail(container, fromPerson.id));
  container.querySelector('#btnSaveRel')?.addEventListener('click', async () => {
    const toId = document.getElementById('relToId').value;
    if (!toId) { showToast('相手を選んでください'); return; }
    const result = await createRelationship({
      from_contact_id: fromPerson.id,
      to_contact_id: toId,
      type: document.getElementById('relType').value,
      note: document.getElementById('relNote').value.trim() || null,
    });
    if (result) {
      showToast('登録しました');
      renderPersonDetail(container, fromPerson.id);
    } else {
      showToast('登録に失敗しました');
    }
  });
}

// ============================================================
// 名刺OCR
// ============================================================
function renderOcr(container) {
  container.innerHTML = `
    <div class="fade-in">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:16px;">
        <button id="btnBack" style="padding:6px 12px;border:1px solid #D6D3CB;border-radius:8px;background:#fff;cursor:pointer;">← 戻る</button>
        <div style="font-size:15px;font-weight:700;">📷 名刺スキャン</div>
      </div>
      <div style="background:#fff;border-radius:12px;padding:16px;border:1px solid #D6D3CB;text-align:center;">
        <p style="font-size:13px;color:#5a6272;margin-bottom:16px;">名刺の写真を撮影または選択</p>
        <input type="file" id="ocrInput" accept="image/*" capture="environment" style="display:none;">
        <button id="btnCapture" style="padding:14px 24px;border-radius:8px;background:#7C3AED;color:#fff;border:none;font-size:14px;font-weight:600;cursor:pointer;">📷 撮影 / 選択</button>
        <div id="ocrPreview" style="margin-top:16px;"></div>
        <div id="ocrResult" style="margin-top:16px;"></div>
      </div>
    </div>
  `;

  container.querySelector('#btnBack')?.addEventListener('click', () => renderTop(container));
  container.querySelector('#btnCapture')?.addEventListener('click', () => document.getElementById('ocrInput')?.click());

  container.querySelector('#ocrInput')?.addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (ev) => {
      document.getElementById('ocrPreview').innerHTML = `<img src="${ev.target.result}" style="max-width:100%;border-radius:8px;">`;
      document.getElementById('ocrResult').innerHTML = '<div style="color:#5a6272;">読み取り中...</div>';
      try {
        const base64 = ev.target.result.split(',')[1];
        const response = await fetch(CONFIG.AWAI_URL + '/functions/v1/ocr', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + CONFIG.AWAI_KEY },
          body: JSON.stringify({ image: base64, type: 'business_card' }),
        });
        if (!response.ok) throw new Error('OCR failed');
        const ocrData = await response.json();
        if (ocrData) {
          const prefill = {
            name: ocrData.name || '', name_kana: ocrData.name_kana || '',
            phone: ocrData.phone || '', email: ocrData.email || '',
            position: ocrData.position || ocrData.title || '', type: '取引先',
            note: ocrData.company ? `会社: ${ocrData.company}` : '',
          };
          document.getElementById('ocrResult').innerHTML = `
            <div style="text-align:left;background:#f5f3ee;padding:12px;border-radius:8px;margin-bottom:12px;">
              ${Object.entries(prefill).filter(([,v]) => v).map(([k,v]) => `<div style="font-size:12px;"><strong>${k}:</strong> ${escapeHtml(v)}</div>`).join('')}
            </div>
            <button id="btnUseOcr" style="width:100%;padding:12px;border-radius:8px;background:#1B3A5C;color:#fff;border:none;font-size:14px;font-weight:600;cursor:pointer;">この内容で登録</button>
          `;
          document.getElementById('btnUseOcr')?.addEventListener('click', () => renderPersonForm(container, prefill));
        }
      } catch (err) {
        document.getElementById('ocrResult').innerHTML = `
          <div style="color:#DC2626;">読み取りに失敗しました</div>
          <button id="btnManual" style="margin-top:8px;padding:10px;border:1px solid #D6D3CB;border-radius:8px;background:#fff;cursor:pointer;">手入力で登録</button>
        `;
        document.getElementById('btnManual')?.addEventListener('click', () => renderPersonForm(container));
      }
    };
    reader.readAsDataURL(file);
  });
}

// ============================================================
// 検索ヘルパー
// ============================================================
function _setupSearch(inputId, resultsId, hiddenId, selectedId, contacts) {
  const input = document.getElementById(inputId);
  const results = document.getElementById(resultsId);
  if (!input || !results) return;
  input.addEventListener('input', () => {
    const q = input.value.toLowerCase();
    if (!q) { results.innerHTML = ''; return; }
    const matches = contacts.filter(c => {
      const text = `${c.name || ''} ${c.name_kana || ''} ${c.note || ''}`.toLowerCase();
      return text.includes(q) && !(c.tags && c.tags.includes('削除済み'));
    }).slice(0, 10);
    results.innerHTML = matches.map(c => `
      <div data-sel-id="${c.id}" data-sel-name="${escapeHtml(c.name)}" style="padding:8px 10px;border:1px solid #eee;border-radius:6px;margin-bottom:4px;cursor:pointer;font-size:13px;">
        ${escapeHtml(c.name)} <span style="color:#8a8a8a;font-size:11px;">${escapeHtml(c.type || '')}</span>
      </div>
    `).join('');
    results.querySelectorAll('[data-sel-id]').forEach(el => {
      el.addEventListener('click', () => {
        document.getElementById(hiddenId).value = el.dataset.selId;
        input.value = el.dataset.selName;
        if (selectedId) document.getElementById(selectedId).textContent = el.dataset.selName;
        results.innerHTML = '';
      });
    });
  });
}
