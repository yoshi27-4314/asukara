/**
 * アスカラ - コンタクトモジュール
 * 人・組織の管理、名刺OCR、関係登録
 */
import { CONFIG } from '../core/config.js';
import {
  getContacts, getContact, createContact, updateContact,
  getOrganizations, getOrganization, createOrganization, updateOrganization,
  getOrgChildren, getOrgContacts,
  getRelationships, createRelationship, deleteRelationship,
  getCases
} from '../core/db.js';
import { showToast, showLoading, showConfirm, emptyState, escapeHtml, contactTypeBadge, formatDate } from '../core/ui.js';
import { navigate } from '../core/router.js';

// ============================================================
//  カラーパレット
// ============================================================
const C = {
  navy: '#1B3A5C',
  teal: '#0D7377',
  gold: '#B8860B',
  bg: '#F5F3EE',
  white: '#FFFFFF',
  border: '#E0DDD5',
  textMain: '#1B3A5C',
  textSub: '#6B7B8D',
  textMuted: '#9AA5B1',
  danger: '#CE2029',
};

// ============================================================
//  内部状態
// ============================================================
let currentView = 'list';       // list | detail | form | org_list | org_detail | org_form | relationship_form
let currentFilter = 'all';      // all | 取引先 | 個人 | 提携士業
let searchQuery = '';
let contactsCache = [];
let orgsCache = [];
let selectedContact = null;
let selectedOrg = null;
let editingContact = null;      // 編集中のコンタクト（null = 新規）
let ocrPrefill = null;          // OCR結果による事前入力

// ============================================================
//  メインエントリ
// ============================================================
export function renderContacts(container, params = {}) {
  // パラメータで直接遷移
  if (params.contactId) {
    openContactDetail(container, params.contactId);
    return;
  }
  if (params.orgId) {
    openOrgDetail(container, params.orgId);
    return;
  }
  if (params.view === 'org_list') {
    renderOrgList(container);
    return;
  }

  renderContactList(container);
}

// ============================================================
//  コンタクト一覧
// ============================================================
async function renderContactList(container) {
  currentView = 'list';
  selectedContact = null;
  editingContact = null;
  ocrPrefill = null;

  container.innerHTML = `
    <div style="background:${C.bg};min-height:100vh;">
      <!-- ヘッダー -->
      <div style="padding:16px 16px 0;display:flex;align-items:center;gap:8px;">
        <button id="contactsBackHome" style="background:none;border:none;color:${C.navy};font-size:20px;cursor:pointer;padding:4px 8px;">←</button>
        <h2 style="color:${C.navy};font-size:18px;margin:0;flex:1;">コンタクト</h2>
        <button id="btnOrgList" style="background:none;border:1px solid ${C.teal};color:${C.teal};font-size:12px;padding:6px 12px;border-radius:8px;cursor:pointer;">組織一覧</button>
      </div>

      <!-- 検索バー -->
      <div style="padding:12px 16px 0;">
        <div style="position:relative;">
          <input id="contactSearch" type="search" placeholder="名前・電話番号・住所・メモで検索"
            value="${escapeHtml(searchQuery)}"
            style="width:100%;box-sizing:border-box;padding:10px 12px 10px 36px;border-radius:10px;border:1px solid ${C.border};background:${C.white};color:${C.textMain};font-size:14px;outline:none;" />
          <span style="position:absolute;left:10px;top:50%;transform:translateY(-50%);color:${C.textMuted};font-size:16px;">🔍</span>
        </div>
      </div>

      <!-- フィルタータブ -->
      <div style="padding:12px 16px 0;">
        <div id="contactTabs" style="display:flex;gap:6px;overflow-x:auto;">
          ${renderFilterTab('all', '全て')}
          ${renderFilterTab('取引先', '取引先')}
          ${renderFilterTab('個人', '個人')}
          ${renderFilterTab('提携士業', '提携士業')}
        </div>
      </div>

      <!-- コンタクトリスト -->
      <div id="contactList" style="padding:12px 16px 120px;"></div>

      <!-- FABボタン群 -->
      <div style="position:fixed;bottom:80px;right:16px;display:flex;flex-direction:column;gap:10px;z-index:100;">
        <button id="btnOcrRegister" style="width:52px;height:52px;border-radius:50%;background:${C.teal};color:${C.white};border:none;font-size:20px;cursor:pointer;box-shadow:0 4px 12px rgba(13,115,119,0.3);display:flex;align-items:center;justify-content:center;">📷</button>
        <button id="btnAddContact" style="width:56px;height:56px;border-radius:50%;background:${C.navy};color:${C.white};border:none;font-size:24px;cursor:pointer;box-shadow:0 4px 12px rgba(27,58,92,0.3);display:flex;align-items:center;justify-content:center;">+</button>
      </div>
    </div>
  `;

  // イベント
  container.querySelector('#contactsBackHome')?.addEventListener('click', () => navigate('home'));

  container.querySelector('#btnOrgList')?.addEventListener('click', () => renderOrgList(container));

  container.querySelector('#contactSearch')?.addEventListener('input', (e) => {
    searchQuery = e.target.value.trim();
    loadContacts(container);
  });

  container.querySelectorAll('.contact-filter-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      currentFilter = tab.dataset.filter;
      container.querySelectorAll('.contact-filter-tab').forEach(t => {
        t.style.background = t.dataset.filter === currentFilter ? C.navy : C.white;
        t.style.color = t.dataset.filter === currentFilter ? C.white : C.textSub;
      });
      loadContacts(container);
    });
  });

  container.querySelector('#btnAddContact')?.addEventListener('click', () => renderContactForm(container, null));

  container.querySelector('#btnOcrRegister')?.addEventListener('click', () => startOcr(container));

  await loadContacts(container);
}

function renderFilterTab(key, label) {
  const active = key === currentFilter;
  return `<button class="contact-filter-tab" data-filter="${key}"
    style="padding:8px 16px;border-radius:20px;border:none;font-size:13px;font-weight:bold;white-space:nowrap;cursor:pointer;
    background:${active ? C.navy : C.white};color:${active ? C.white : C.textSub};transition:all 0.2s;">
    ${label}
  </button>`;
}

// ============================================================
//  コンタクト読み込み
// ============================================================
async function loadContacts(container) {
  const listEl = container.querySelector('#contactList');
  if (!listEl) return;

  showLoading(listEl);

  try {
    const filters = { limit: searchQuery ? 50 : 20 };
    if (searchQuery) filters.search = searchQuery;
    if (currentFilter !== 'all') filters.type = currentFilter;

    contactsCache = await getContacts(filters);
    // 削除済みを除外
    contactsCache = contactsCache.filter(c => !(c.tags && c.tags.includes('削除済み')));

    if (contactsCache.length === 0) {
      listEl.innerHTML = emptyState('👥', searchQuery ? '該当するコンタクトがありません' : 'コンタクトがまだ登録されていません');
      return;
    }

    listEl.innerHTML = contactsCache.map(c => renderContactCard(c)).join('');

    listEl.querySelectorAll('.contact-card').forEach(card => {
      card.addEventListener('click', () => {
        const id = card.dataset.id;
        if (id) openContactDetail(container, id);
      });
    });
  } catch (err) {
    console.error('コンタクト読み込みエラー:', err);
    listEl.innerHTML = emptyState('⚠️', '読み込みに失敗しました');
    showToast('コンタクトの読み込みに失敗しました');
  }
}

function renderContactCard(contact) {
  const orgName = contact.organization?.name || contact.organization_name || '';
  const caseCount = contact.case_count ?? '';

  return `
    <div class="contact-card" data-id="${contact.id}"
      style="background:${C.white};border-radius:12px;padding:14px;margin-bottom:8px;cursor:pointer;
      border:1px solid ${C.border};transition:transform 0.15s;">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:6px;">
        <div style="font-size:15px;color:${C.textMain};font-weight:bold;">${escapeHtml(contact.name)}</div>
        <div>${contactTypeBadge(contact.type)}</div>
      </div>
      ${orgName ? `<div style="font-size:12px;color:${C.textSub};margin-bottom:4px;">🏢 ${escapeHtml(orgName)}${contact.position ? ' / ' + escapeHtml(contact.position) : ''}</div>` : ''}
      <div style="display:flex;justify-content:space-between;align-items:center;">
        ${contact.phone ? `<span style="font-size:12px;color:${C.textSub};">📞 ${escapeHtml(contact.phone)}</span>` : '<span></span>'}
        ${caseCount !== '' ? `<span style="font-size:11px;color:${C.teal};font-weight:bold;">案件 ${caseCount}件</span>` : ''}
      </div>
    </div>
  `;
}

// ============================================================
//  コンタクト詳細
// ============================================================
async function openContactDetail(container, contactId) {
  currentView = 'detail';
  showLoading(container);

  try {
    const contact = await getContact(contactId);
    if (!contact) {
      showToast('コンタクトが見つかりません');
      renderContactList(container);
      return;
    }
    selectedContact = contact;

    // 関連データを並列取得
    const [relationships, cases, org] = await Promise.all([
      getRelationships(contactId),
      getCases({ contactId }),
      contact.organization_id ? getOrganization(contact.organization_id) : Promise.resolve(null),
    ]);

    container.innerHTML = `
      <div style="background:${C.bg};min-height:100vh;padding-bottom:40px;">
        <!-- ヘッダー -->
        <div style="padding:16px;display:flex;align-items:center;gap:8px;">
          <button id="detailBack" style="background:none;border:none;color:${C.navy};font-size:14px;cursor:pointer;padding:4px 0;">← 一覧に戻る</button>
          <div style="flex:1;"></div>
          <button id="btnEditContact" style="background:none;border:1px solid ${C.gold};color:${C.gold};font-size:12px;padding:6px 14px;border-radius:8px;cursor:pointer;">編集</button>
          <button id="btnDeleteContact" style="background:none;border:1px solid #DC2626;color:#DC2626;font-size:12px;padding:6px 14px;border-radius:8px;cursor:pointer;">削除</button>
        </div>

        <!-- 基本情報 -->
        <div style="background:${C.white};border-radius:12px;padding:16px;margin:0 16px 12px;border:1px solid ${C.border};">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
            <div style="font-size:20px;color:${C.textMain};font-weight:bold;">${escapeHtml(contact.name)}</div>
            ${contactTypeBadge(contact.type)}
          </div>
          ${contact.name_kana ? `<div style="font-size:12px;color:${C.textMuted};margin-bottom:8px;">${escapeHtml(contact.name_kana)}</div>` : ''}

          <div style="display:flex;flex-direction:column;gap:6px;margin-top:8px;">
            ${contact.phone ? `<div style="font-size:13px;color:${C.textSub};">📞 <a href="tel:${escapeHtml(contact.phone)}" style="color:${C.teal};text-decoration:none;">${escapeHtml(contact.phone)}</a></div>` : ''}
            ${contact.email ? `<div style="font-size:13px;color:${C.textSub};">📧 <a href="mailto:${escapeHtml(contact.email)}" style="color:${C.teal};text-decoration:none;">${escapeHtml(contact.email)}</a></div>` : ''}
            ${org ? `<div id="orgLink" style="font-size:13px;color:${C.textSub};cursor:pointer;">🏢 <span style="color:${C.teal};text-decoration:underline;">${escapeHtml(org.name)}</span>${contact.position ? ' / ' + escapeHtml(contact.position) : ''}</div>` : ''}
            ${contact.note ? `<div style="font-size:13px;color:${C.textSub};margin-top:4px;padding:8px;background:${C.bg};border-radius:6px;line-height:1.5;">📝 ${escapeHtml(contact.note)}</div>` : ''}
          </div>
        </div>

        <!-- 関係 -->
        <div style="background:${C.white};border-radius:12px;padding:16px;margin:0 16px 12px;border:1px solid ${C.border};">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
            <h3 style="color:${C.textMain};font-size:14px;margin:0;">🔗 関係</h3>
            <button id="btnAddRelation" style="background:none;border:1px solid ${C.teal};color:${C.teal};font-size:11px;padding:4px 10px;border-radius:6px;cursor:pointer;">関係を追加</button>
          </div>
          <div id="relationshipList">
            ${relationships.length > 0
              ? relationships.map(r => {
                  const otherContact = r.from_contact_id === contactId ? r.to_contact : r.from_contact;
                  const otherName = otherContact?.name || '不明';
                  return `
                    <div style="display:flex;align-items:center;justify-content:space-between;padding:8px 0;border-bottom:1px solid ${C.border};">
                      <div>
                        <span style="font-size:13px;color:${C.textMain};font-weight:bold;cursor:pointer;" data-rel-contact-id="${otherContact?.id || ''}">${escapeHtml(otherName)}</span>
                        <span style="font-size:11px;color:${C.white};background:${C.teal};padding:2px 6px;border-radius:8px;margin-left:6px;">${escapeHtml(r.type)}</span>
                        ${r.note ? `<div style="font-size:11px;color:${C.textMuted};margin-top:2px;">${escapeHtml(r.note)}</div>` : ''}
                      </div>
                      <button data-del-rel="${r.id}" style="background:none;border:none;color:${C.danger};font-size:16px;cursor:pointer;padding:4px 8px;">×</button>
                    </div>
                  `;
                }).join('')
              : `<div style="color:${C.textMuted};font-size:13px;text-align:center;padding:12px;">関係が登録されていません</div>`
            }
          </div>
        </div>

        <!-- 案件 -->
        <div style="background:${C.white};border-radius:12px;padding:16px;margin:0 16px 12px;border:1px solid ${C.border};">
          <h3 style="color:${C.textMain};font-size:14px;margin:0 0 12px;">📋 案件</h3>
          <div id="caseList">
            ${cases.length > 0
              ? cases.map(c => renderCaseCard(c)).join('')
              : `<div style="color:${C.textMuted};font-size:13px;text-align:center;padding:12px;">関連する案件はありません</div>`
            }
          </div>
        </div>
      </div>
    `;

    // イベント
    container.querySelector('#detailBack')?.addEventListener('click', () => renderContactList(container));
    container.querySelector('#btnEditContact')?.addEventListener('click', () => renderContactForm(container, contact));
    container.querySelector('#btnDeleteContact')?.addEventListener('click', () => {
      showConfirm(`「${contact.name}」を削除済みにしますか？\nデータは残ります。一覧には表示されなくなります。`, async () => {
        const { updateContact } = await import('../core/db.js');
        await updateContact(contact.id, { tags: [...(contact.tags || []), '削除済み'] });
        showToast('削除済みにしました');
        renderContactList(container);
      });
    });
    container.querySelector('#btnAddRelation')?.addEventListener('click', () => renderRelationshipForm(container, contact));

    // 組織リンク
    container.querySelector('#orgLink')?.addEventListener('click', () => {
      if (org) openOrgDetail(container, org.id);
    });

    // 関係先コンタクトタップ
    container.querySelectorAll('[data-rel-contact-id]').forEach(el => {
      el.addEventListener('click', () => {
        const id = el.dataset.relContactId;
        if (id) openContactDetail(container, id);
      });
    });

    // 関係削除
    container.querySelectorAll('[data-del-rel]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const relId = btn.dataset.delRel;
        showConfirm('この関係を削除しますか？', async () => {
          try {
            await deleteRelationship(relId);
            showToast('関係を削除しました');
            openContactDetail(container, contactId);
          } catch (err) {
            console.error('関係削除エラー:', err);
            showToast('削除に失敗しました');
          }
        });
      });
    });

    // 案件タップ
    container.querySelectorAll('.case-mini-card').forEach(card => {
      card.addEventListener('click', () => {
        const caseId = card.dataset.caseId;
        if (caseId) navigate('cases', { caseId });
      });
    });

  } catch (err) {
    console.error('コンタクト詳細エラー:', err);
    showToast('詳細の読み込みに失敗しました');
    renderContactList(container);
  }
}

function renderCaseCard(c) {
  const statusColors = {
    '受付': C.navy,
    'ヒアリング': C.navy,
    '振り分け': C.gold,
    '同行紹介': C.teal,
    '事業部対応中': C.teal,
    '完了確認': '#7B2D8E',
    '紹介獲得': '#006B3F',
    '保留': C.textMuted,
    '失注': C.danger,
    'フォロー中': C.gold,
  };
  const color = statusColors[c.status] || C.textSub;

  return `
    <div class="case-mini-card" data-case-id="${c.id}"
      style="padding:10px 0;border-bottom:1px solid ${C.border};cursor:pointer;">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;">
        <span style="font-size:13px;color:${C.textMain};font-weight:bold;">${escapeHtml(c.title || '（無題）')}</span>
        <span style="display:inline-block;padding:2px 8px;border-radius:10px;font-size:11px;font-weight:bold;background:${color}18;color:${color};">${escapeHtml(c.status || '')}</span>
      </div>
      <div style="font-size:11px;color:${C.textMuted};">${formatDate(c.created_at)}</div>
    </div>
  `;
}

// ============================================================
//  コンタクト登録/編集フォーム
// ============================================================
async function renderContactForm(container, contact) {
  currentView = 'form';
  editingContact = contact;
  const isEdit = !!contact;

  // 組織一覧を取得（セレクトボックス用）
  let allOrgs = [];
  try {
    allOrgs = await getOrganizations();
  } catch { /* ignore */ }
  orgsCache = allOrgs;

  // 事前入力データ（OCR or 編集）
  const data = ocrPrefill || contact || {};

  container.innerHTML = `
    <div style="background:${C.bg};min-height:100vh;padding-bottom:40px;">
      <!-- ヘッダー -->
      <div style="padding:16px;display:flex;align-items:center;gap:8px;">
        <button id="formBack" style="background:none;border:none;color:${C.navy};font-size:14px;cursor:pointer;padding:4px 0;">← 戻る</button>
        <h2 style="color:${C.navy};font-size:16px;margin:0;flex:1;">${isEdit ? 'コンタクト編集' : '新規コンタクト'}</h2>
      </div>

      ${ocrPrefill ? `
        <div style="margin:0 16px 12px;padding:10px 14px;background:#E8F5E9;border-radius:8px;border:1px solid #A5D6A7;font-size:12px;color:#2E7D32;">
          📷 名刺OCRの読み取り結果です。内容を確認して保存してください。
        </div>
      ` : ''}

      <div style="padding:0 16px;">
        <!-- 名前（必須） -->
        <div style="margin-bottom:14px;">
          <label style="font-size:12px;color:${C.textSub};display:block;margin-bottom:4px;">氏名 <span style="color:${C.danger};">*必須</span></label>
          <input id="fName" type="text" value="${escapeHtml(data.name || '')}" placeholder="例: 田中 太郎"
            style="width:100%;box-sizing:border-box;padding:10px 12px;border-radius:8px;border:1px solid ${C.border};background:${C.white};color:${C.textMain};font-size:15px;outline:none;" />
        </div>

        <!-- ふりがな -->
        <div style="margin-bottom:14px;">
          <label style="font-size:12px;color:${C.textSub};display:block;margin-bottom:4px;">ふりがな</label>
          <input id="fNameKana" type="text" value="${escapeHtml(data.name_kana || '')}" placeholder="例: たなか たろう"
            style="width:100%;box-sizing:border-box;padding:10px 12px;border-radius:8px;border:1px solid ${C.border};background:${C.white};color:${C.textMain};font-size:14px;outline:none;" />
        </div>

        <!-- 電話 -->
        <div style="margin-bottom:14px;">
          <label style="font-size:12px;color:${C.textSub};display:block;margin-bottom:4px;">電話番号</label>
          <input id="fPhone" type="tel" value="${escapeHtml(data.phone || '')}" placeholder="例: 058-000-0000"
            style="width:100%;box-sizing:border-box;padding:10px 12px;border-radius:8px;border:1px solid ${C.border};background:${C.white};color:${C.textMain};font-size:14px;outline:none;" />
        </div>

        <!-- メール -->
        <div style="margin-bottom:14px;">
          <label style="font-size:12px;color:${C.textSub};display:block;margin-bottom:4px;">メール</label>
          <input id="fEmail" type="email" value="${escapeHtml(data.email || '')}" placeholder="例: tanaka@example.com"
            style="width:100%;box-sizing:border-box;padding:10px 12px;border-radius:8px;border:1px solid ${C.border};background:${C.white};color:${C.textMain};font-size:14px;outline:none;" />
        </div>

        <!-- タイプ -->
        <div style="margin-bottom:14px;">
          <label style="font-size:12px;color:${C.textSub};display:block;margin-bottom:4px;">タイプ</label>
          <select id="fType"
            style="width:100%;box-sizing:border-box;padding:10px 12px;border-radius:8px;border:1px solid ${C.border};background:${C.white};color:${C.textMain};font-size:14px;outline:none;">
            ${(CONFIG.CONTACT_TYPES || ['取引先', '個人', '提携士業', 'エンドユーザー', '紹介者']).map(t =>
              `<option value="${escapeHtml(t)}" ${(data.type || '') === t ? 'selected' : ''}>${escapeHtml(t)}</option>`
            ).join('')}
          </select>
        </div>

        <!-- 組織 -->
        <div style="margin-bottom:14px;">
          <label style="font-size:12px;color:${C.textSub};display:block;margin-bottom:4px;">所属組織</label>
          <div style="position:relative;">
            <input id="fOrgSearch" type="text" placeholder="組織名を検索..."
              value="${escapeHtml(data.organization_name || (allOrgs.find(o => o.id === data.organization_id)?.name) || '')}"
              style="width:100%;box-sizing:border-box;padding:10px 12px;border-radius:8px;border:1px solid ${C.border};background:${C.white};color:${C.textMain};font-size:14px;outline:none;" />
            <input id="fOrgId" type="hidden" value="${data.organization_id || ''}" />
            <div id="orgSearchResults" style="display:none;position:absolute;top:100%;left:0;right:0;background:${C.white};border:1px solid ${C.border};border-radius:0 0 8px 8px;max-height:200px;overflow-y:auto;z-index:10;box-shadow:0 4px 12px rgba(0,0,0,0.1);"></div>
          </div>
        </div>

        <!-- 役職 -->
        <div style="margin-bottom:14px;">
          <label style="font-size:12px;color:${C.textSub};display:block;margin-bottom:4px;">役職</label>
          <input id="fPosition" type="text" value="${escapeHtml(data.position || '')}" placeholder="例: 営業部長"
            style="width:100%;box-sizing:border-box;padding:10px 12px;border-radius:8px;border:1px solid ${C.border};background:${C.white};color:${C.textMain};font-size:14px;outline:none;" />
        </div>

        <!-- メモ -->
        <div style="margin-bottom:20px;">
          <label style="font-size:12px;color:${C.textSub};display:block;margin-bottom:4px;">メモ</label>
          <textarea id="fNote" rows="3" placeholder="特記事項があれば入力"
            style="width:100%;box-sizing:border-box;padding:10px 12px;border-radius:8px;border:1px solid ${C.border};background:${C.white};color:${C.textMain};font-size:13px;outline:none;resize:vertical;line-height:1.5;"
          >${escapeHtml(data.note || '')}</textarea>
        </div>

        <!-- 保存ボタン -->
        <button id="btnSaveContact"
          style="width:100%;padding:14px;border-radius:12px;border:none;background:${C.navy};color:${C.white};font-size:16px;font-weight:bold;cursor:pointer;margin-bottom:16px;">
          ${isEdit ? '更新する' : '登録する'}
        </button>
      </div>
    </div>
  `;

  // イベント
  container.querySelector('#formBack')?.addEventListener('click', () => {
    if (isEdit && selectedContact) {
      openContactDetail(container, selectedContact.id);
    } else {
      renderContactList(container);
    }
  });

  // 組織検索
  const orgSearchInput = container.querySelector('#fOrgSearch');
  const orgIdInput = container.querySelector('#fOrgId');
  const orgResults = container.querySelector('#orgSearchResults');

  orgSearchInput?.addEventListener('input', () => {
    const q = orgSearchInput.value.trim().toLowerCase();
    if (!q) {
      orgResults.style.display = 'none';
      orgIdInput.value = '';
      return;
    }
    const matched = allOrgs.filter(o => o.name.toLowerCase().includes(q)).slice(0, 10);
    if (matched.length === 0) {
      orgResults.style.display = 'none';
      return;
    }
    orgResults.style.display = 'block';
    orgResults.innerHTML = matched.map(o =>
      `<div data-org-id="${o.id}" style="padding:10px 12px;cursor:pointer;border-bottom:1px solid ${C.border};font-size:13px;color:${C.textMain};">${escapeHtml(o.name)}</div>`
    ).join('');
    orgResults.querySelectorAll('[data-org-id]').forEach(el => {
      el.addEventListener('click', () => {
        orgIdInput.value = el.dataset.orgId;
        orgSearchInput.value = el.textContent.trim();
        orgResults.style.display = 'none';
      });
    });
  });

  orgSearchInput?.addEventListener('blur', () => {
    setTimeout(() => { orgResults.style.display = 'none'; }, 200);
  });

  // 保存
  container.querySelector('#btnSaveContact')?.addEventListener('click', async () => {
    const name = container.querySelector('#fName')?.value?.trim();
    if (!name) {
      showToast('氏名は必須です');
      container.querySelector('#fName')?.focus();
      return;
    }

    const payload = {
      name,
      name_kana: container.querySelector('#fNameKana')?.value?.trim() || null,
      phone: container.querySelector('#fPhone')?.value?.trim() || null,
      email: container.querySelector('#fEmail')?.value?.trim() || null,
      type: container.querySelector('#fType')?.value || null,
      organization_id: container.querySelector('#fOrgId')?.value || null,
      position: container.querySelector('#fPosition')?.value?.trim() || null,
      note: container.querySelector('#fNote')?.value?.trim() || null,
    };

    try {
      if (isEdit) {
        await updateContact(contact.id, payload);
        showToast('コンタクトを更新しました');
        ocrPrefill = null;
        openContactDetail(container, contact.id);
      } else {
        const newContact = await createContact(payload);
        showToast('コンタクトを登録しました');
        ocrPrefill = null;
        if (newContact?.id) {
          openContactDetail(container, newContact.id);
        } else {
          renderContactList(container);
        }
      }
    } catch (err) {
      console.error('コンタクト保存エラー:', err);
      showToast(isEdit ? '更新に失敗しました' : '登録に失敗しました');
    }
  });
}

// ============================================================
//  名刺OCR
// ============================================================
async function startOcr(container) {
  // カメラ/ギャラリーから画像を選択
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'image/*';
  input.capture = 'environment';

  input.addEventListener('change', async () => {
    const file = input.files?.[0];
    if (!file) return;

    showLoading(container, '名刺を読み取り中...');

    try {
      // ファイルをbase64に変換
      const base64 = await fileToBase64(file);

      // OCR API呼び出し
      const res = await fetch(CONFIG.AWAI_URL + '/functions/v1/ocr', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${CONFIG.AWAI_KEY}`,
        },
        body: JSON.stringify({
          image: base64,
          type: 'business_card',
        }),
      });

      if (!res.ok) {
        throw new Error(`OCR API Error: ${res.status}`);
      }

      const result = await res.json();

      // OCR結果をパース
      const parsed = parseOcrResult(result);

      if (!parsed.name && !parsed.phone && !parsed.email) {
        showToast('名刺の情報を読み取れませんでした。手入力してください。');
        renderContactForm(container, null);
        return;
      }

      showToast('名刺を読み取りました。内容を確認してください。');

      // OCR結果で事前入力してフォームを開く
      ocrPrefill = parsed;
      renderContactForm(container, null);

    } catch (err) {
      console.error('OCRエラー:', err);
      showToast('名刺の読み取りに失敗しました');
      renderContactList(container);
    }
  });

  input.click();
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function parseOcrResult(result) {
  // OCR結果の形式は Edge Function の実装次第
  // 一般的なフィールドをマッピング
  const data = result.data || result.result || result;

  return {
    name: data.name || data.full_name || data.氏名 || '',
    name_kana: data.name_kana || data.furigana || data.ふりがな || '',
    phone: data.phone || data.tel || data.電話番号 || '',
    email: data.email || data.メール || '',
    position: data.position || data.title || data.役職 || '',
    organization_name: data.company || data.organization || data.会社名 || '',
    type: '取引先',
    note: data.address ? `住所: ${data.address}` : '',
  };
}

// ============================================================
//  組織一覧
// ============================================================
async function renderOrgList(container) {
  currentView = 'org_list';

  container.innerHTML = `
    <div style="background:${C.bg};min-height:100vh;">
      <!-- ヘッダー -->
      <div style="padding:16px;display:flex;align-items:center;gap:8px;">
        <button id="orgListBack" style="background:none;border:none;color:${C.navy};font-size:14px;cursor:pointer;padding:4px 0;">← コンタクトに戻る</button>
        <div style="flex:1;"></div>
        <button id="btnAddOrg" style="background:${C.teal};color:${C.white};border:none;font-size:12px;padding:6px 14px;border-radius:8px;cursor:pointer;">+ 組織登録</button>
      </div>

      <div style="padding:0 16px;">
        <h2 style="color:${C.navy};font-size:16px;margin:0 0 12px;">🏢 組織管理</h2>
      </div>

      <div id="orgTreeContainer" style="padding:0 16px 100px;"></div>
    </div>
  `;

  container.querySelector('#orgListBack')?.addEventListener('click', () => renderContactList(container));
  container.querySelector('#btnAddOrg')?.addEventListener('click', () => renderOrgForm(container, null));

  await loadOrgTree(container);
}

async function loadOrgTree(container) {
  const treeEl = container.querySelector('#orgTreeContainer');
  if (!treeEl) return;

  showLoading(treeEl);

  try {
    const allOrgs = await getOrganizations();
    orgsCache = allOrgs;

    if (allOrgs.length === 0) {
      treeEl.innerHTML = emptyState('🏢', '組織がまだ登録されていません');
      return;
    }

    // ツリー構造を構築（parent_id が null のものがルート）
    const roots = allOrgs.filter(o => !o.parent_id);
    const childMap = {};
    allOrgs.forEach(o => {
      if (o.parent_id) {
        if (!childMap[o.parent_id]) childMap[o.parent_id] = [];
        childMap[o.parent_id].push(o);
      }
    });

    function renderOrgNode(org, depth = 0) {
      const children = childMap[org.id] || [];
      const indent = depth * 20;
      const typeLabel = org.type ? `<span style="font-size:10px;color:${C.teal};margin-left:6px;">${escapeHtml(org.type)}</span>` : '';

      let html = `
        <div class="org-node" data-org-id="${org.id}"
          style="background:${C.white};border-radius:8px;padding:12px 14px;margin-bottom:6px;margin-left:${indent}px;
          border:1px solid ${C.border};cursor:pointer;transition:transform 0.15s;">
          <div style="display:flex;align-items:center;gap:6px;">
            <span style="font-size:14px;">${depth === 0 ? '🏢' : depth === 1 ? '🏬' : '📁'}</span>
            <span style="font-size:14px;color:${C.textMain};font-weight:bold;">${escapeHtml(org.name)}</span>
            ${typeLabel}
          </div>
          ${org.phone ? `<div style="font-size:11px;color:${C.textMuted};margin-top:4px;margin-left:26px;">📞 ${escapeHtml(org.phone)}</div>` : ''}
        </div>
      `;

      children.forEach(child => {
        html += renderOrgNode(child, depth + 1);
      });

      return html;
    }

    treeEl.innerHTML = roots.map(r => renderOrgNode(r)).join('');

    // ルートでない孤立した組織も表示
    const renderedIds = new Set();
    function collectIds(org) {
      renderedIds.add(org.id);
      (childMap[org.id] || []).forEach(c => collectIds(c));
    }
    roots.forEach(r => collectIds(r));

    const orphans = allOrgs.filter(o => !renderedIds.has(o.id));
    if (orphans.length > 0) {
      treeEl.innerHTML += orphans.map(o => renderOrgNode(o)).join('');
    }

    treeEl.querySelectorAll('.org-node').forEach(node => {
      node.addEventListener('click', () => {
        const orgId = node.dataset.orgId;
        if (orgId) openOrgDetail(container, orgId);
      });
    });

  } catch (err) {
    console.error('組織読み込みエラー:', err);
    treeEl.innerHTML = emptyState('⚠️', '組織の読み込みに失敗しました');
  }
}

// ============================================================
//  組織詳細
// ============================================================
async function openOrgDetail(container, orgId) {
  currentView = 'org_detail';
  showLoading(container);

  try {
    const [org, children, contacts] = await Promise.all([
      getOrganization(orgId),
      getOrgChildren(orgId),
      getOrgContacts(orgId),
    ]);

    if (!org) {
      showToast('組織が見つかりません');
      renderOrgList(container);
      return;
    }
    selectedOrg = org;

    container.innerHTML = `
      <div style="background:${C.bg};min-height:100vh;padding-bottom:40px;">
        <!-- ヘッダー -->
        <div style="padding:16px;display:flex;align-items:center;gap:8px;">
          <button id="orgDetailBack" style="background:none;border:none;color:${C.navy};font-size:14px;cursor:pointer;padding:4px 0;">← 組織一覧に戻る</button>
          <div style="flex:1;"></div>
          <button id="btnEditOrg" style="background:none;border:1px solid ${C.gold};color:${C.gold};font-size:12px;padding:6px 14px;border-radius:8px;cursor:pointer;">編集</button>
        </div>

        <!-- 基本情報 -->
        <div style="background:${C.white};border-radius:12px;padding:16px;margin:0 16px 12px;border:1px solid ${C.border};">
          <div style="font-size:20px;color:${C.textMain};font-weight:bold;margin-bottom:8px;">🏢 ${escapeHtml(org.name)}</div>
          ${org.type ? `<div style="font-size:12px;color:${C.teal};margin-bottom:6px;">${escapeHtml(org.type)}</div>` : ''}
          ${org.address ? `<div style="font-size:13px;color:${C.textSub};margin-bottom:4px;">📍 ${escapeHtml(org.address)}</div>` : ''}
          ${org.phone ? `<div style="font-size:13px;color:${C.textSub};">📞 ${escapeHtml(org.phone)}</div>` : ''}
        </div>

        <!-- 子組織 -->
        <div style="background:${C.white};border-radius:12px;padding:16px;margin:0 16px 12px;border:1px solid ${C.border};">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
            <h3 style="color:${C.textMain};font-size:14px;margin:0;">📁 下部組織</h3>
            <button id="btnAddChildOrg" style="background:none;border:1px solid ${C.teal};color:${C.teal};font-size:11px;padding:4px 10px;border-radius:6px;cursor:pointer;">+ 追加</button>
          </div>
          ${children.length > 0
            ? children.map(c => `
              <div class="child-org" data-child-org-id="${c.id}" style="padding:10px 0;border-bottom:1px solid ${C.border};cursor:pointer;">
                <div style="font-size:14px;color:${C.textMain};font-weight:bold;">${escapeHtml(c.name)}</div>
                ${c.type ? `<div style="font-size:11px;color:${C.textMuted};">${escapeHtml(c.type)}</div>` : ''}
              </div>
            `).join('')
            : `<div style="color:${C.textMuted};font-size:13px;text-align:center;padding:12px;">下部組織はありません</div>`
          }
        </div>

        <!-- 所属コンタクト -->
        <div style="background:${C.white};border-radius:12px;padding:16px;margin:0 16px 12px;border:1px solid ${C.border};">
          <h3 style="color:${C.textMain};font-size:14px;margin:0 0 12px;">👥 所属コンタクト</h3>
          ${contacts.length > 0
            ? contacts.map(c => `
              <div class="org-contact" data-contact-id="${c.id}" style="display:flex;align-items:center;justify-content:space-between;padding:10px 0;border-bottom:1px solid ${C.border};cursor:pointer;">
                <div>
                  <div style="font-size:14px;color:${C.textMain};font-weight:bold;">${escapeHtml(c.name)}</div>
                  ${c.position ? `<div style="font-size:11px;color:${C.textMuted};">${escapeHtml(c.position)}</div>` : ''}
                </div>
                ${contactTypeBadge(c.type)}
              </div>
            `).join('')
            : `<div style="color:${C.textMuted};font-size:13px;text-align:center;padding:12px;">所属するコンタクトはいません</div>`
          }
        </div>
      </div>
    `;

    // イベント
    container.querySelector('#orgDetailBack')?.addEventListener('click', () => renderOrgList(container));
    container.querySelector('#btnEditOrg')?.addEventListener('click', () => renderOrgForm(container, org));
    container.querySelector('#btnAddChildOrg')?.addEventListener('click', () => renderOrgForm(container, null, org.id));

    container.querySelectorAll('.child-org').forEach(el => {
      el.addEventListener('click', () => {
        const id = el.dataset.childOrgId;
        if (id) openOrgDetail(container, id);
      });
    });

    container.querySelectorAll('.org-contact').forEach(el => {
      el.addEventListener('click', () => {
        const id = el.dataset.contactId;
        if (id) openContactDetail(container, id);
      });
    });

  } catch (err) {
    console.error('組織詳細エラー:', err);
    showToast('組織情報の読み込みに失敗しました');
    renderOrgList(container);
  }
}

// ============================================================
//  組織登録/編集フォーム
// ============================================================
async function renderOrgForm(container, org, parentId = null) {
  currentView = 'org_form';
  const isEdit = !!org;

  // 親組織の選択肢用
  let allOrgs = [];
  try {
    allOrgs = await getOrganizations();
  } catch { /* ignore */ }

  const data = org || {};
  const presetParentId = parentId || data.parent_id || '';

  container.innerHTML = `
    <div style="background:${C.bg};min-height:100vh;padding-bottom:40px;">
      <!-- ヘッダー -->
      <div style="padding:16px;display:flex;align-items:center;gap:8px;">
        <button id="orgFormBack" style="background:none;border:none;color:${C.navy};font-size:14px;cursor:pointer;padding:4px 0;">← 戻る</button>
        <h2 style="color:${C.navy};font-size:16px;margin:0;flex:1;">${isEdit ? '組織編集' : '新規組織'}</h2>
      </div>

      <div style="padding:0 16px;">
        <!-- 組織名（必須） -->
        <div style="margin-bottom:14px;">
          <label style="font-size:12px;color:${C.textSub};display:block;margin-bottom:4px;">組織名 <span style="color:${C.danger};">*必須</span></label>
          <input id="fOrgName" type="text" value="${escapeHtml(data.name || '')}" placeholder="例: 渡辺不動産"
            style="width:100%;box-sizing:border-box;padding:10px 12px;border-radius:8px;border:1px solid ${C.border};background:${C.white};color:${C.textMain};font-size:15px;outline:none;" />
        </div>

        <!-- タイプ -->
        <div style="margin-bottom:14px;">
          <label style="font-size:12px;color:${C.textSub};display:block;margin-bottom:4px;">組織タイプ</label>
          <select id="fOrgType"
            style="width:100%;box-sizing:border-box;padding:10px 12px;border-radius:8px;border:1px solid ${C.border};background:${C.white};color:${C.textMain};font-size:14px;outline:none;">
            <option value="">選択してください</option>
            ${['会社', '支店', '部署', '事務所', '団体', 'その他'].map(t =>
              `<option value="${t}" ${(data.type || '') === t ? 'selected' : ''}>${t}</option>`
            ).join('')}
          </select>
        </div>

        <!-- 親組織 -->
        <div style="margin-bottom:14px;">
          <label style="font-size:12px;color:${C.textSub};display:block;margin-bottom:4px;">親組織</label>
          <select id="fOrgParent"
            style="width:100%;box-sizing:border-box;padding:10px 12px;border-radius:8px;border:1px solid ${C.border};background:${C.white};color:${C.textMain};font-size:14px;outline:none;">
            <option value="">なし（トップレベル）</option>
            ${allOrgs.filter(o => !isEdit || o.id !== org?.id).map(o =>
              `<option value="${o.id}" ${presetParentId === o.id ? 'selected' : ''}>${escapeHtml(o.name)}</option>`
            ).join('')}
          </select>
        </div>

        <!-- 住所 -->
        <div style="margin-bottom:14px;">
          <label style="font-size:12px;color:${C.textSub};display:block;margin-bottom:4px;">住所</label>
          <input id="fOrgAddress" type="text" value="${escapeHtml(data.address || '')}" placeholder="例: 岐阜県岐阜市..."
            style="width:100%;box-sizing:border-box;padding:10px 12px;border-radius:8px;border:1px solid ${C.border};background:${C.white};color:${C.textMain};font-size:14px;outline:none;" />
        </div>

        <!-- 電話 -->
        <div style="margin-bottom:20px;">
          <label style="font-size:12px;color:${C.textSub};display:block;margin-bottom:4px;">電話番号</label>
          <input id="fOrgPhone" type="tel" value="${escapeHtml(data.phone || '')}" placeholder="例: 058-000-0000"
            style="width:100%;box-sizing:border-box;padding:10px 12px;border-radius:8px;border:1px solid ${C.border};background:${C.white};color:${C.textMain};font-size:14px;outline:none;" />
        </div>

        <!-- 保存ボタン -->
        <button id="btnSaveOrg"
          style="width:100%;padding:14px;border-radius:12px;border:none;background:${C.teal};color:${C.white};font-size:16px;font-weight:bold;cursor:pointer;margin-bottom:16px;">
          ${isEdit ? '更新する' : '登録する'}
        </button>
      </div>
    </div>
  `;

  // イベント
  container.querySelector('#orgFormBack')?.addEventListener('click', () => {
    if (isEdit && selectedOrg) {
      openOrgDetail(container, selectedOrg.id);
    } else if (parentId) {
      openOrgDetail(container, parentId);
    } else {
      renderOrgList(container);
    }
  });

  container.querySelector('#btnSaveOrg')?.addEventListener('click', async () => {
    const name = container.querySelector('#fOrgName')?.value?.trim();
    if (!name) {
      showToast('組織名は必須です');
      container.querySelector('#fOrgName')?.focus();
      return;
    }

    const payload = {
      name,
      type: container.querySelector('#fOrgType')?.value || null,
      parent_id: container.querySelector('#fOrgParent')?.value || null,
      address: container.querySelector('#fOrgAddress')?.value?.trim() || null,
      phone: container.querySelector('#fOrgPhone')?.value?.trim() || null,
    };

    try {
      if (isEdit) {
        await updateOrganization(org.id, payload);
        showToast('組織を更新しました');
        openOrgDetail(container, org.id);
      } else {
        const newOrg = await createOrganization(payload);
        showToast('組織を登録しました');
        if (newOrg?.id) {
          openOrgDetail(container, newOrg.id);
        } else {
          renderOrgList(container);
        }
      }
    } catch (err) {
      console.error('組織保存エラー:', err);
      showToast(isEdit ? '更新に失敗しました' : '登録に失敗しました');
    }
  });
}

// ============================================================
//  関係登録フォーム
// ============================================================
async function renderRelationshipForm(container, fromContact) {
  currentView = 'relationship_form';

  // コンタクト一覧を取得（検索用）
  let allContacts = [];
  try {
    allContacts = await getContacts({});
  } catch { /* ignore */ }

  const relationTypes = CONFIG.RELATIONSHIP_TYPES || ['紹介', '同僚', '友人', '上司・部下', '所属', '提携', 'その他'];

  container.innerHTML = `
    <div style="background:${C.bg};min-height:100vh;padding-bottom:40px;">
      <!-- ヘッダー -->
      <div style="padding:16px;display:flex;align-items:center;gap:8px;">
        <button id="relFormBack" style="background:none;border:none;color:${C.navy};font-size:14px;cursor:pointer;padding:4px 0;">← 戻る</button>
        <h2 style="color:${C.navy};font-size:16px;margin:0;">関係を追加</h2>
      </div>

      <div style="padding:0 16px;">
        <!-- 元のコンタクト -->
        <div style="margin-bottom:14px;">
          <label style="font-size:12px;color:${C.textSub};display:block;margin-bottom:4px;">コンタクト</label>
          <div style="padding:10px 12px;border-radius:8px;background:${C.white};border:1px solid ${C.border};color:${C.textMain};font-size:14px;">
            ${escapeHtml(fromContact.name)}
          </div>
        </div>

        <!-- 関係先コンタクト（検索） -->
        <div style="margin-bottom:14px;">
          <label style="font-size:12px;color:${C.textSub};display:block;margin-bottom:4px;">関係先 <span style="color:${C.danger};">*必須</span></label>
          <div style="position:relative;">
            <input id="relContactSearch" type="text" placeholder="名前で検索..."
              style="width:100%;box-sizing:border-box;padding:10px 12px;border-radius:8px;border:1px solid ${C.border};background:${C.white};color:${C.textMain};font-size:14px;outline:none;" />
            <input id="relContactId" type="hidden" value="" />
            <div id="relContactResults" style="display:none;position:absolute;top:100%;left:0;right:0;background:${C.white};border:1px solid ${C.border};border-radius:0 0 8px 8px;max-height:200px;overflow-y:auto;z-index:10;box-shadow:0 4px 12px rgba(0,0,0,0.1);"></div>
          </div>
        </div>

        <!-- 関係タイプ -->
        <div style="margin-bottom:14px;">
          <label style="font-size:12px;color:${C.textSub};display:block;margin-bottom:4px;">関係タイプ <span style="color:${C.danger};">*必須</span></label>
          <select id="relType"
            style="width:100%;box-sizing:border-box;padding:10px 12px;border-radius:8px;border:1px solid ${C.border};background:${C.white};color:${C.textMain};font-size:14px;outline:none;">
            <option value="">選択してください</option>
            ${relationTypes.map(t => `<option value="${t}">${t}</option>`).join('')}
          </select>
        </div>

        <!-- メモ -->
        <div style="margin-bottom:20px;">
          <label style="font-size:12px;color:${C.textSub};display:block;margin-bottom:4px;">メモ（任意）</label>
          <textarea id="relNote" rows="2" placeholder="補足情報があれば入力"
            style="width:100%;box-sizing:border-box;padding:10px 12px;border-radius:8px;border:1px solid ${C.border};background:${C.white};color:${C.textMain};font-size:13px;outline:none;resize:vertical;line-height:1.5;"></textarea>
        </div>

        <!-- 保存ボタン -->
        <button id="btnSaveRelation"
          style="width:100%;padding:14px;border-radius:12px;border:none;background:${C.navy};color:${C.white};font-size:16px;font-weight:bold;cursor:pointer;">
          関係を登録
        </button>
      </div>
    </div>
  `;

  // イベント
  container.querySelector('#relFormBack')?.addEventListener('click', () => {
    openContactDetail(container, fromContact.id);
  });

  // 関係先検索
  const searchInput = container.querySelector('#relContactSearch');
  const contactIdInput = container.querySelector('#relContactId');
  const resultsEl = container.querySelector('#relContactResults');

  searchInput?.addEventListener('input', () => {
    const q = searchInput.value.trim().toLowerCase();
    if (!q) {
      resultsEl.style.display = 'none';
      return;
    }
    const matched = allContacts
      .filter(c => c.id !== fromContact.id && c.name.toLowerCase().includes(q))
      .slice(0, 10);

    if (matched.length === 0) {
      resultsEl.style.display = 'none';
      return;
    }

    resultsEl.style.display = 'block';
    resultsEl.innerHTML = matched.map(c =>
      `<div data-contact-id="${c.id}" style="padding:10px 12px;cursor:pointer;border-bottom:1px solid ${C.border};font-size:13px;color:${C.textMain};">
        ${escapeHtml(c.name)}${c.organization?.name ? ` <span style="color:${C.textMuted};font-size:11px;">(${escapeHtml(c.organization.name)})</span>` : ''}
      </div>`
    ).join('');

    resultsEl.querySelectorAll('[data-contact-id]').forEach(el => {
      el.addEventListener('click', () => {
        contactIdInput.value = el.dataset.contactId;
        searchInput.value = el.textContent.trim();
        resultsEl.style.display = 'none';
      });
    });
  });

  searchInput?.addEventListener('blur', () => {
    setTimeout(() => { resultsEl.style.display = 'none'; }, 200);
  });

  // 保存
  container.querySelector('#btnSaveRelation')?.addEventListener('click', async () => {
    const toContactId = contactIdInput?.value;
    const relType = container.querySelector('#relType')?.value;
    const note = container.querySelector('#relNote')?.value?.trim() || null;

    if (!toContactId) {
      showToast('関係先のコンタクトを選択してください');
      searchInput?.focus();
      return;
    }
    if (!relType) {
      showToast('関係タイプを選択してください');
      return;
    }

    try {
      await createRelationship({
        from_contact_id: fromContact.id,
        to_contact_id: toContactId,
        type: relType,
        note,
      });
      showToast('関係を登録しました');
      openContactDetail(container, fromContact.id);
    } catch (err) {
      console.error('関係登録エラー:', err);
      showToast('関係の登録に失敗しました');
    }
  });
}
