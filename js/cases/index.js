/**
 * アスカラ - 案件モジュール
 * 受付→現地調査→ヒアリングはアスカラで管理
 * 見積以降はboardで管理（リンクで飛ぶ）
 */
import { CONFIG } from '../core/config.js';
import {
  getCases, getCase, createCase, updateCase,
  getCaseHistory, addCaseHistory,
  getCaseDivisions, setCaseDivisions,
  getContacts, getContact, getCaseStatusCounts,
  getOrganizations
} from '../core/db.js';
import {
  showToast, showLoading, showConfirm, statusBadge,
  emptyState, escapeHtml, formatDate, formatDateTime, formatPrice, divisionBadge
} from '../core/ui.js';
import { getCurrentStaff } from '../core/auth.js';
import { navigate } from '../core/router.js';

export function renderCases(container, params = {}) {
  if (params.action === 'detail' && params.id) {
    renderCaseDetail(container, params.id);
  } else if (params.action === 'new') {
    renderNewCase(container);
  } else {
    renderCaseList(container);
  }
}

// ============================================================
// 案件一覧（2セクション：アスカラ進行中 + board案件）
// ============================================================
async function renderCaseList(container) {
  showLoading(container, '読み込み中...');

  const statusCounts = await getCaseStatusCounts();

  // アスカラ独自ステータスの案件（受付〜ヒアリング）
  const asukaraStatuses = ['受付', '現地調査', 'ヒアリング', '振り分け', '同行紹介', '事業部対応中', '完了確認', '紹介獲得', '保留', 'フォロー中'];
  const boardStatuses = ['受注済', '受注確定', '見積中(高)', '見積中(中)', '見積中(低)', '見積中(除)', '失注'];

  container.innerHTML = `
    <div class="fade-in">
      <!-- 検索 -->
      <div style="margin-bottom:16px;">
        <input type="search" id="caseSearch" placeholder="案件名・顧客名・住所で検索..."
          style="width:100%;padding:12px 14px;border:1px solid #D6D3CB;border-radius:10px;font-size:15px;background:#fff;">
      </div>

      <!-- アスカラ進行中 -->
      <div style="margin-bottom:20px;">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
          <div style="font-size:14px;font-weight:700;color:#B8860B;">📞 アスカラ対応中</div>
          <button id="btnNewCase" style="padding:6px 14px;background:#0D7377;color:#fff;border:none;border-radius:8px;font-size:12px;font-weight:600;cursor:pointer;">＋ 新規受付</button>
        </div>
        <div id="asukaraCases"></div>
      </div>

      <!-- board案件 -->
      <div>
        <div style="font-size:14px;font-weight:700;color:#1B3A5C;margin-bottom:8px;">📋 board案件</div>
        <div style="display:flex;gap:6px;overflow-x:auto;padding-bottom:8px;margin-bottom:8px;">
          <button class="filter-tab active" data-filter="全て">全て</button>
          <button class="filter-tab" data-filter="受注済" style="border-color:#059669;color:#059669;">受注済 (${statusCounts['受注済'] || 0})</button>
          <button class="filter-tab" data-filter="受注確定" style="border-color:#D97706;color:#D97706;">受注確定 (${statusCounts['受注確定'] || 0})</button>
          <button class="filter-tab" data-filter="見積中(除)">見積中除 (${statusCounts['見積中(除)'] || 0})</button>
        </div>
        <div id="boardCases"></div>
      </div>
    </div>
  `;

  // アスカラ案件を表示
  const asukaraCasesList = await getCases({ limit: 50 });
  const asukaraCases = asukaraCasesList.filter(c => asukaraStatuses.includes(c.status));
  renderCaseSection(container.querySelector('#asukaraCases'), asukaraCases, true);

  // board案件を表示（最新20件）
  let boardCases = asukaraCasesList.filter(c => boardStatuses.includes(c.status)).slice(0, 20);
  if (boardCases.length === 0) {
    boardCases = await getCases({ status: '受注済', limit: 20 });
  }
  renderCaseSection(container.querySelector('#boardCases'), boardCases, false);

  // 新規受付ボタン
  container.querySelector('#btnNewCase')?.addEventListener('click', () => renderNewCase(container));

  // boardフィルタータブ
  container.querySelectorAll('.filter-tab').forEach(btn => {
    btn.addEventListener('click', async () => {
      container.querySelectorAll('.filter-tab').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const f = btn.dataset.filter;
      let cases;
      if (f === '全て') {
        cases = await getCases({ limit: 20 });
        cases = cases.filter(c => boardStatuses.includes(c.status));
      } else {
        cases = await getCases({ status: f, limit: 50 });
      }
      renderCaseSection(container.querySelector('#boardCases'), cases, false);
    });
  });

  // 検索
  let searchTimer = null;
  container.querySelector('#caseSearch')?.addEventListener('input', (e) => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(async () => {
      const q = e.target.value.trim();
      if (q.length >= 2) {
        const results = await getCases({ search: q, limit: 50 });
        const asukara = results.filter(c => asukaraStatuses.includes(c.status));
        const board = results.filter(c => boardStatuses.includes(c.status));
        renderCaseSection(container.querySelector('#asukaraCases'), asukara, true);
        renderCaseSection(container.querySelector('#boardCases'), board, false);
      } else if (q.length === 0) {
        // リセット
        const all = await getCases({ limit: 50 });
        renderCaseSection(container.querySelector('#asukaraCases'), all.filter(c => asukaraStatuses.includes(c.status)), true);
        renderCaseSection(container.querySelector('#boardCases'), all.filter(c => boardStatuses.includes(c.status)).slice(0, 20), false);
      }
    }, 300);
  });
}

function renderCaseSection(el, cases, isAsukara) {
  if (!el) return;
  const filtered = cases.filter(c => c.status !== '削除済み' && c.status !== 'アーカイブ');

  if (filtered.length === 0) {
    el.innerHTML = `<div style="text-align:center;padding:20px;color:#8a8a8a;font-size:13px;">${isAsukara ? '対応中の案件はありません' : '該当する案件はありません'}</div>`;
    return;
  }

  el.innerHTML = filtered.map(c => {
    const boardIdMatch = (c.note || '').match(/board_id:(\d+)/);
    const boardLink = boardIdMatch ? `https://the-board.jp/projects/${boardIdMatch[1]}/edit` : '';

    return `
      <div style="background:#fff;border-radius:10px;padding:12px;margin-bottom:6px;border:1px solid ${isAsukara ? '#B8860B40' : '#D6D3CB'};${isAsukara ? 'border-left:3px solid #B8860B;' : ''}">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;">
          <div style="flex:1;cursor:pointer;" data-detail-id="${c.id}">
            <div style="font-weight:700;font-size:14px;">${escapeHtml(c.title)}</div>
            <div style="font-size:11px;color:#5a6272;margin-top:2px;">
              ${c.category ? escapeHtml(c.category) + ' · ' : ''}${formatDate(c.created_at)}
              ${c.revenue ? ' · ' + formatPrice(c.revenue) : ''}
            </div>
          </div>
          <div style="display:flex;flex-direction:column;align-items:flex-end;gap:4px;">
            ${statusBadge(c.status)}
            ${boardLink ? `<a href="${boardLink}" target="_blank" style="font-size:10px;color:#0078D4;text-decoration:none;">board→</a>` : ''}
          </div>
        </div>
      </div>
    `;
  }).join('');

  el.querySelectorAll('[data-detail-id]').forEach(el => {
    el.addEventListener('click', () => {
      const container = el.closest('.fade-in')?.parentElement || document.getElementById('mainContent');
      renderCaseDetail(container, el.dataset.detailId);
    });
  });
}

// ============================================================
// 案件詳細
// ============================================================
async function renderCaseDetail(container, caseId) {
  showLoading(container, '読み込み中...');

  const [caseData, divisions, history] = await Promise.all([
    getCase(caseId),
    getCaseDivisions(caseId),
    getCaseHistory(caseId),
  ]);

  if (!caseData) {
    container.innerHTML = emptyState('❌', '案件が見つかりません');
    return;
  }

  // 関係者の名前
  const contactNames = {};
  for (const field of ['contact_id', 'end_user_id', 'referrer_id']) {
    if (caseData[field]) {
      const c = await getContact(caseData[field]);
      contactNames[field] = c?.name || '不明';
    }
  }

  // boardリンク
  const boardIdMatch = (caseData.note || '').match(/board_id:(\d+)/);
  const boardLink = boardIdMatch ? `https://the-board.jp/projects/${boardIdMatch[1]}/edit` : '';

  // アスカラ独自ステータスかboardステータスか
  const isAsukaraStatus = CONFIG.CASE_STATUS_FLOW.includes(caseData.status) || ['保留', 'フォロー中'].includes(caseData.status);
  const nextStatus = isAsukaraStatus ? _getNextStatus(caseData.status) : null;

  container.innerHTML = `
    <div class="fade-in">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:12px;">
        <button id="btnBack" style="padding:6px 12px;border:1px solid #D6D3CB;border-radius:8px;background:#fff;cursor:pointer;font-size:14px;">← 戻る</button>
      </div>

      <!-- タイトル -->
      <div style="background:#fff;border-radius:12px;padding:16px;border:1px solid #D6D3CB;margin-bottom:12px;">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
          <div style="font-size:18px;font-weight:700;">${escapeHtml(caseData.title)}</div>
          ${statusBadge(caseData.status)}
        </div>
        ${caseData.description ? `<div style="font-size:13px;color:#5a6272;margin-bottom:8px;">${escapeHtml(caseData.description)}</div>` : ''}
        ${caseData.site_address ? `<div style="font-size:13px;color:#5a6272;">📍 ${escapeHtml(caseData.site_address)}</div>` : ''}
        ${caseData.revenue ? `<div style="font-size:14px;font-weight:700;color:#059669;margin-top:4px;">売上: ${formatPrice(caseData.revenue)}</div>` : ''}
        ${boardLink ? `<a href="${boardLink}" target="_blank" style="display:inline-flex;align-items:center;gap:4px;padding:8px 16px;background:#0078D4;color:#fff;border-radius:8px;font-size:13px;font-weight:600;text-decoration:none;margin-top:8px;">📋 boardで見積・請求</a>` : ''}
      </div>

      <!-- アスカラステータス操作 -->
      ${isAsukaraStatus ? `
        <div style="background:#fff;border-radius:12px;padding:16px;border:1px solid #B8860B40;margin-bottom:12px;">
          <div style="font-size:13px;font-weight:700;color:#B8860B;margin-bottom:8px;">📞 アスカラ ステータス</div>
          ${nextStatus ? `<button id="btnAdvance" style="width:100%;padding:10px;background:#1B3A5C;color:#fff;border:none;border-radius:8px;font-size:13px;font-weight:600;cursor:pointer;margin-bottom:8px;">→ ${nextStatus}へ進める</button>` : ''}
          ${caseData.status === 'ヒアリング' || caseData.status === '現地調査' ? `<a href="https://the-board.jp/projects/new" target="_blank" style="display:block;width:100%;padding:10px;background:#0078D4;color:#fff;border:none;border-radius:8px;font-size:13px;font-weight:600;cursor:pointer;text-align:center;text-decoration:none;margin-bottom:8px;">📋 boardで見積書を作成</a>` : ''}
          <div style="display:flex;gap:6px;">
            <button class="statusBtn" data-status="保留" style="flex:1;padding:6px;border:1px solid #6B7280;border-radius:6px;background:#fff;color:#6B7280;font-size:11px;cursor:pointer;">保留</button>
            <button class="statusBtn" data-status="フォロー中" style="flex:1;padding:6px;border:1px solid #7C3AED;border-radius:6px;background:#fff;color:#7C3AED;font-size:11px;cursor:pointer;">フォロー中</button>
          </div>
        </div>
      ` : ''}

      <!-- 人間関係 -->
      <div style="background:#fff;border-radius:12px;padding:16px;border:1px solid #D6D3CB;margin-bottom:12px;">
        <div style="font-size:13px;font-weight:700;color:#B8860B;margin-bottom:8px;">🤝 人間関係</div>
        ${contactNames.contact_id ? `<div style="font-size:13px;margin-bottom:4px;">依頼者: <span style="color:#0D7377;cursor:pointer;" data-goto="${caseData.contact_id}">${escapeHtml(contactNames.contact_id)}</span></div>` : '<div style="font-size:12px;color:#8a8a8a;">依頼者未設定</div>'}
        ${contactNames.referrer_id ? `<div style="font-size:13px;margin-bottom:4px;">紹介者: <span style="color:#B8860B;" data-goto="${caseData.referrer_id}">${escapeHtml(contactNames.referrer_id)}</span></div>` : ''}
        ${contactNames.end_user_id ? `<div style="font-size:13px;">エンドユーザー: <span style="color:#0D7377;" data-goto="${caseData.end_user_id}">${escapeHtml(contactNames.end_user_id)}</span></div>` : ''}
      </div>

      <!-- 事業部振り分け -->
      <div style="background:#fff;border-radius:12px;padding:16px;border:1px solid #D6D3CB;margin-bottom:12px;">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
          <div style="font-size:13px;font-weight:700;color:#B8860B;">🔀 事業部振り分け</div>
          <button id="btnAssignDiv" style="padding:4px 10px;border:1px solid #D6D3CB;border-radius:6px;background:#fff;cursor:pointer;font-size:11px;color:#0D7377;">振り分け</button>
        </div>
        ${divisions.length > 0 ? divisions.map(d => `
          <div style="display:flex;align-items:center;gap:8px;padding:4px 0;">
            ${divisionBadge(d.division)}
            <span style="font-size:11px;color:#8a8a8a;">${escapeHtml(d.role)}</span>
          </div>
        `).join('') : '<div style="font-size:12px;color:#8a8a8a;">未振り分け</div>'}
      </div>

      <!-- メモ -->
      <div style="background:#fff;border-radius:12px;padding:16px;border:1px solid #D6D3CB;margin-bottom:12px;">
        <div style="font-size:13px;font-weight:700;color:#5a6272;margin-bottom:8px;">📝 メモ</div>
        <button id="btnAddNote" style="width:100%;padding:8px;border:1px dashed #D6D3CB;border-radius:8px;background:transparent;color:#0D7377;font-size:12px;cursor:pointer;">＋ メモを追加</button>
        ${history.length > 0 ? history.map(h => `
          <div style="padding:6px 0;border-bottom:1px solid #eee;margin-top:6px;">
            <div style="font-size:11px;color:#8a8a8a;">${formatDateTime(h.created_at)}</div>
            ${h.note ? `<div style="font-size:12px;margin-top:2px;">${escapeHtml(h.note)}</div>` : ''}
          </div>
        `).join('') : ''}
      </div>

      <!-- アーカイブ・削除 -->
      <div style="display:flex;gap:8px;margin-bottom:16px;">
        <button id="btnArchive" style="flex:1;padding:6px;border:1px solid #9CA3AF;border-radius:6px;background:#fff;color:#9CA3AF;font-size:11px;cursor:pointer;">アーカイブ</button>
        <button id="btnDelete" style="flex:1;padding:6px;border:1px solid #DC2626;border-radius:6px;background:#fff;color:#DC2626;font-size:11px;cursor:pointer;">削除済み</button>
      </div>
    </div>
  `;

  // イベント
  container.querySelector('#btnBack')?.addEventListener('click', () => renderCaseList(container));

  container.querySelectorAll('[data-goto]').forEach(el => {
    el.addEventListener('click', () => navigate('contacts', { action: 'detail', id: el.dataset.goto }));
  });

  container.querySelector('#btnAdvance')?.addEventListener('click', () => {
    if (!nextStatus) return;
    showConfirm(`「${nextStatus}」に進めますか？`, async () => {
      const staff = getCurrentStaff();
      await updateCase(caseId, { status: nextStatus });
      await addCaseHistory({ case_id: caseId, status: nextStatus, note: `${caseData.status} → ${nextStatus}`, updated_by: staff?.name || null });
      showToast(`「${nextStatus}」に進めました`);
      renderCaseDetail(container, caseId);
    });
  });

  container.querySelectorAll('.statusBtn').forEach(btn => {
    btn.addEventListener('click', () => {
      const newStatus = btn.dataset.status;
      showConfirm(`「${newStatus}」に変更しますか？`, async () => {
        const staff = getCurrentStaff();
        await updateCase(caseId, { status: newStatus });
        await addCaseHistory({ case_id: caseId, status: newStatus, note: `${caseData.status} → ${newStatus}`, updated_by: staff?.name || null });
        showToast(`「${newStatus}」に変更しました`);
        renderCaseDetail(container, caseId);
      });
    });
  });

  container.querySelector('#btnAssignDiv')?.addEventListener('click', () => renderDivisionAssignment(container, caseData, divisions));
  container.querySelector('#btnAddNote')?.addEventListener('click', () => showNoteDialog(container, caseData));

  container.querySelector('#btnArchive')?.addEventListener('click', () => {
    showConfirm('アーカイブしますか？', async () => {
      await updateCase(caseId, { status: 'アーカイブ' });
      showToast('アーカイブしました');
      renderCaseList(container);
    });
  });

  container.querySelector('#btnDelete')?.addEventListener('click', () => {
    showConfirm('削除済みにしますか？', async () => {
      await updateCase(caseId, { status: '削除済み' });
      showToast('削除済みにしました');
      renderCaseList(container);
    });
  });
}

function _getNextStatus(current) {
  const flow = CONFIG.CASE_STATUS_FLOW;
  const idx = flow.indexOf(current);
  if (idx >= 0 && idx < flow.length - 1) return flow[idx + 1];
  return null;
}

// ============================================================
// 新規案件受付（アスカラで受付→ヒアリング）
// ============================================================
async function renderNewCase(container) {
  const [contacts, orgs] = await Promise.all([
    getContacts({ limit: 700 }),
    getOrganizations(),
  ]);

  container.innerHTML = `
    <div class="fade-in">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:16px;">
        <button id="btnBack" style="padding:6px 12px;border:1px solid #D6D3CB;border-radius:8px;background:#fff;cursor:pointer;font-size:14px;">← 戻る</button>
        <div style="font-size:15px;font-weight:700;">📞 新規案件受付</div>
      </div>

      <div style="background:#fff;border-radius:12px;padding:16px;border:1px solid #D6D3CB;">
        <div class="form-group">
          <label>困りごとの概要 *</label>
          <input type="text" id="fTitle" placeholder="例: 岐阜市○○町 片付け相談">
        </div>

        <div class="form-group">
          <label>依頼者（顧客名を入力して選択）</label>
          <input type="text" id="fClientSearch" placeholder="美濃善、加藤、山田...">
          <div id="fClientResults" style="max-height:150px;overflow-y:auto;margin-top:4px;"></div>
          <input type="hidden" id="fContactId">
          <div id="fClientSelected" style="margin-top:4px;font-size:13px;color:#0D7377;font-weight:600;"></div>
        </div>

        <div class="form-group">
          <label>紹介者（いれば）</label>
          <input type="text" id="fRefSearch" placeholder="名前で検索...">
          <div id="fRefResults" style="max-height:150px;overflow-y:auto;margin-top:4px;"></div>
          <input type="hidden" id="fRefId">
          <div id="fRefSelected" style="margin-top:4px;font-size:13px;color:#B8860B;font-weight:600;"></div>
        </div>

        <div class="form-group">
          <label>困りごとの詳細</label>
          <textarea id="fDesc" placeholder="聞き取った内容をメモ..."></textarea>
        </div>

        <div class="form-group">
          <label>現地住所</label>
          <input type="text" id="fAddress" placeholder="岐阜県岐阜市...">
        </div>

        <button id="btnSave" style="width:100%;padding:12px;border-radius:8px;background:#1B3A5C;color:#fff;border:none;font-size:14px;font-weight:600;cursor:pointer;">受付登録</button>
      </div>
    </div>
  `;

  // 顧客検索
  _setupSearch('fClientSearch', 'fClientResults', 'fContactId', 'fClientSelected', contacts);
  _setupSearch('fRefSearch', 'fRefResults', 'fRefId', 'fRefSelected', contacts);

  container.querySelector('#btnBack')?.addEventListener('click', () => renderCaseList(container));

  container.querySelector('#btnSave')?.addEventListener('click', async () => {
    const title = document.getElementById('fTitle').value.trim();
    if (!title) { showToast('困りごとの概要を入力してください'); return; }

    const staff = getCurrentStaff();
    const caseData = {
      title,
      description: document.getElementById('fDesc').value.trim() || null,
      site_address: document.getElementById('fAddress').value.trim() || null,
      status: '受付',
      contact_id: document.getElementById('fContactId').value || null,
      referrer_id: document.getElementById('fRefId').value || null,
    };

    const result = await createCase(caseData);
    if (result) {
      await addCaseHistory({
        case_id: result.id,
        status: '受付',
        note: '案件受付',
        updated_by: staff?.name || null,
      });
      showToast('受付登録しました');
      renderCaseDetail(container, result.id);
    } else {
      showToast('登録に失敗しました');
    }
  });
}

function _setupSearch(inputId, resultsId, hiddenId, selectedId, contacts) {
  const input = document.getElementById(inputId);
  const results = document.getElementById(resultsId);
  if (!input || !results) return;

  input.addEventListener('input', () => {
    const q = input.value.toLowerCase();
    if (!q) { results.innerHTML = ''; return; }
    const matches = contacts.filter(c => {
      const text = `${c.name || ''} ${c.name_kana || ''} ${c.note || ''}`.toLowerCase();
      return text.includes(q) && !c.registered_by?.includes('担当者');
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

// ============================================================
// メモ追加ダイアログ
// ============================================================
function showNoteDialog(container, caseData) {
  const overlay = document.createElement('div');
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(27,58,92,0.5);z-index:10000;display:flex;align-items:center;justify-content:center;padding:20px;';
  overlay.innerHTML = `
    <div style="background:#fff;border-radius:16px;padding:24px;max-width:360px;width:100%;box-shadow:0 8px 32px rgba(27,58,92,0.2);">
      <div style="font-size:16px;font-weight:700;margin-bottom:16px;">メモを追加</div>
      <textarea id="noteText" style="width:100%;min-height:100px;padding:10px;border:1px solid #D6D3CB;border-radius:8px;font-size:14px;font-family:inherit;" placeholder="メモ内容..."></textarea>
      <div style="display:flex;gap:12px;margin-top:12px;">
        <button id="noteCancel" style="flex:1;padding:12px;border-radius:8px;background:#f0f0f0;color:#5a6272;border:none;font-size:14px;cursor:pointer;">キャンセル</button>
        <button id="noteSave" style="flex:1;padding:12px;border-radius:8px;background:#1B3A5C;color:#fff;border:none;font-size:14px;font-weight:600;cursor:pointer;">保存</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
  overlay.querySelector('#noteCancel').addEventListener('click', () => overlay.remove());
  overlay.querySelector('#noteSave').addEventListener('click', async () => {
    const text = document.getElementById('noteText').value.trim();
    if (!text) { showToast('メモを入力してください'); return; }
    const staff = getCurrentStaff();
    await addCaseHistory({ case_id: caseData.id, status: caseData.status, note: text, updated_by: staff?.name || null });
    overlay.remove();
    showToast('メモを追加しました');
    renderCaseDetail(container, caseData.id);
  });
}

// ============================================================
// 事業部振り分け
// ============================================================
function renderDivisionAssignment(container, caseData, currentDivisions) {
  const selected = {};
  currentDivisions.forEach(d => { selected[d.division] = d.role; });

  container.innerHTML = `
    <div class="fade-in">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:16px;">
        <button id="btnBack" style="padding:6px 12px;border:1px solid #D6D3CB;border-radius:8px;background:#fff;cursor:pointer;font-size:14px;">← 戻る</button>
        <div style="font-size:15px;font-weight:700;">事業部振り分け</div>
      </div>
      <div style="background:#fff;border-radius:12px;padding:16px;border:1px solid #D6D3CB;">
        ${CONFIG.DIVISIONS.map(div => {
          const isSelected = !!selected[div];
          const role = selected[div] || '並列';
          return `
            <div style="padding:12px;border:1px solid ${isSelected ? '#0D7377' : '#D6D3CB'};border-radius:8px;margin-bottom:8px;">
              <label style="display:flex;align-items:center;gap:8px;cursor:pointer;">
                <input type="checkbox" class="divCheck" data-div="${div}" ${isSelected ? 'checked' : ''} style="width:18px;height:18px;">
                <span style="font-weight:600;">${div}</span>
              </label>
              ${isSelected ? `<div style="padding-left:26px;margin-top:8px;"><select class="divRole" data-div="${div}" style="padding:6px;border:1px solid #D6D3CB;border-radius:6px;font-size:13px;">${CONFIG.DIVISION_ROLES.map(r => `<option value="${r}" ${role === r ? 'selected' : ''}>${r}</option>`).join('')}</select></div>` : ''}
            </div>`;
        }).join('')}
        <button id="btnSaveDiv" style="width:100%;padding:12px;border-radius:8px;background:#1B3A5C;color:#fff;border:none;font-size:14px;font-weight:600;cursor:pointer;margin-top:8px;">保存</button>
      </div>
    </div>
  `;

  container.querySelectorAll('.divCheck').forEach(cb => {
    cb.addEventListener('change', () => {
      if (cb.checked) selected[cb.dataset.div] = '並列'; else delete selected[cb.dataset.div];
      renderDivisionAssignment(container, caseData, Object.entries(selected).map(([division, role]) => ({ division, role })));
    });
  });
  container.querySelector('#btnBack')?.addEventListener('click', () => renderCaseDetail(container, caseData.id));
  container.querySelector('#btnSaveDiv')?.addEventListener('click', async () => {
    const divs = [];
    container.querySelectorAll('.divCheck:checked').forEach(cb => {
      const div = cb.dataset.div;
      const roleEl = container.querySelector(`.divRole[data-div="${div}"]`);
      divs.push({ division: div, role: roleEl?.value || '並列' });
    });
    await setCaseDivisions(caseData.id, divs);
    showToast('保存しました');
    renderCaseDetail(container, caseData.id);
  });
}
