/**
 * アスカラ - 案件モジュール（boardビューワー）
 * boardのデータを表示。編集はboardへ飛ぶ。
 * アスカラ独自の情報（紹介者・事業部振り分け）を付加。
 */
import { CONFIG } from '../core/config.js';
import {
  getCases, getCase, createCase, updateCase,
  getCaseHistory, addCaseHistory,
  getCaseDivisions, setCaseDivisions,
  getContacts, getContact, getCaseStatusCounts
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
// 案件一覧（board同期ビュー）
// ============================================================
async function renderCaseList(container) {
  showLoading(container, '案件を読み込み中...');

  const statusCounts = await getCaseStatusCounts();

  container.innerHTML = `
    <div class="fade-in">
      <!-- 検索 -->
      <div style="margin-bottom:12px;">
        <input type="search" id="caseSearch" placeholder="案件名・顧客名・住所で検索..."
          style="width:100%;padding:12px 14px;border:1px solid #D6D3CB;border-radius:10px;font-size:15px;background:#fff;box-shadow:0 1px 4px rgba(27,58,92,0.06);">
      </div>

      <!-- ステータスサマリー -->
      <div style="display:flex;gap:6px;overflow-x:auto;padding-bottom:8px;margin-bottom:12px;">
        <button class="filter-tab active" data-filter="全て">全て <span style="font-size:10px;">(${statusCounts._total || 0})</span></button>
        <button class="filter-tab" data-filter="受注済" style="border-color:#059669;color:#059669;">受注済 (${statusCounts['受注済'] || 0})</button>
        <button class="filter-tab" data-filter="受注確定" style="border-color:#D97706;color:#D97706;">受注確定 (${statusCounts['受注確定'] || 0})</button>
        <button class="filter-tab" data-filter="見積中(除)">見積中除 (${statusCounts['見積中(除)'] || 0})</button>
        <button class="filter-tab" data-filter="見積中(中)">見積中 (${statusCounts['見積中(中)'] || 0})</button>
      </div>

      <!-- 案件リスト -->
      <div id="caseListBody"></div>

      <!-- 新規案件ボタン -->
      <button class="fab" id="fabAddCase">＋</button>
    </div>
  `;

  // 最新20件を表示
  let currentCases = await getCases({ limit: 20 });
  renderCaseCards(container, currentCases);

  // フィルタータブ
  container.querySelectorAll('.filter-tab').forEach(btn => {
    btn.addEventListener('click', async () => {
      container.querySelectorAll('.filter-tab').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const f = btn.dataset.filter;
      if (f === '全て') {
        currentCases = await getCases({ limit: 50 });
      } else {
        currentCases = await getCases({ status: f, limit: 50 });
      }
      renderCaseCards(container, currentCases);
    });
  });

  // 検索
  let searchTimer = null;
  container.querySelector('#caseSearch')?.addEventListener('input', (e) => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(async () => {
      const q = e.target.value.trim();
      if (q.length >= 2) {
        currentCases = await getCases({ search: q, limit: 50 });
      } else if (q.length === 0) {
        currentCases = await getCases({ limit: 20 });
      }
      renderCaseCards(container, currentCases);
    }, 300);
  });

  container.querySelector('#fabAddCase')?.addEventListener('click', () => renderNewCase(container));
}

function renderCaseCards(container, cases) {
  const body = container.querySelector('#caseListBody');
  if (!body) return;

  const filtered = cases.filter(c => c.status !== '削除済み');

  if (filtered.length === 0) {
    body.innerHTML = emptyState('🔍', '該当する案件はありません');
    return;
  }

  body.innerHTML = filtered.map(c => {
    const boardIdMatch = (c.note || '').match(/board_id:(\d+)/);
    const boardLink = boardIdMatch ? `https://the-board.jp/projects/${boardIdMatch[1]}/edit` : '';

    return `
      <div style="background:#fff;border-radius:10px;padding:14px;margin-bottom:8px;border:1px solid #D6D3CB;box-shadow:0 1px 3px rgba(27,58,92,0.06);">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;">
          <div style="flex:1;">
            <div style="font-weight:700;font-size:14px;margin-bottom:4px;">${escapeHtml(c.title)}</div>
            <div style="font-size:12px;color:#5a6272;">
              ${c.category ? escapeHtml(c.category) + ' · ' : ''}${formatDate(c.created_at)}
              ${c.revenue ? ' · ' + formatPrice(c.revenue) : ''}
            </div>
          </div>
          <div>${statusBadge(c.status)}</div>
        </div>
        <div style="display:flex;gap:8px;margin-top:8px;">
          ${boardLink ? `<a href="${boardLink}" target="_blank" style="padding:4px 10px;background:#0078D4;color:#fff;border-radius:6px;font-size:11px;text-decoration:none;font-weight:600;">boardで編集</a>` : ''}
          <button data-detail-id="${c.id}" style="padding:4px 10px;background:#f5f3ee;color:#1B3A5C;border:1px solid #D6D3CB;border-radius:6px;font-size:11px;cursor:pointer;">詳細</button>
        </div>
      </div>
    `;
  }).join('');

  body.querySelectorAll('[data-detail-id]').forEach(btn => {
    btn.addEventListener('click', () => renderCaseDetail(container, btn.dataset.detailId));
  });
}

// ============================================================
// 案件詳細（boardデータ + アスカラ独自情報）
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

  container.innerHTML = `
    <div class="fade-in">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:12px;">
        <button id="btnBack" style="padding:6px 12px;border:1px solid #D6D3CB;border-radius:8px;background:#fff;cursor:pointer;font-size:14px;">← 戻る</button>
      </div>

      <!-- タイトル + ステータス -->
      <div style="background:#fff;border-radius:12px;padding:16px;border:1px solid #D6D3CB;margin-bottom:12px;">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
          <div style="font-size:18px;font-weight:700;">${escapeHtml(caseData.title)}</div>
          ${statusBadge(caseData.status)}
        </div>
        ${boardLink ? `<a href="${boardLink}" target="_blank" style="display:inline-flex;align-items:center;gap:4px;padding:8px 16px;background:#0078D4;color:#fff;border-radius:8px;font-size:13px;font-weight:600;text-decoration:none;">📋 boardで編集・見積・請求</a>` : ''}
      </div>

      <!-- 基本情報（board由来） -->
      <div style="background:#fff;border-radius:12px;padding:16px;border:1px solid #D6D3CB;margin-bottom:12px;">
        <div style="font-size:13px;font-weight:700;color:#5a6272;margin-bottom:8px;">基本情報</div>
        ${caseData.category ? `<div style="font-size:13px;margin-bottom:4px;">分類: ${escapeHtml(caseData.category)}</div>` : ''}
        ${caseData.site_address ? `<div style="font-size:13px;margin-bottom:4px;">📍 ${escapeHtml(caseData.site_address)}</div>` : ''}
        ${caseData.revenue ? `<div style="font-size:14px;font-weight:700;color:#059669;">売上: ${formatPrice(caseData.revenue)}</div>` : ''}
      </div>

      <!-- アスカラ独自：関係者 -->
      <div style="background:#fff;border-radius:12px;padding:16px;border:1px solid #D6D3CB;margin-bottom:12px;">
        <div style="font-size:13px;font-weight:700;color:#B8860B;margin-bottom:8px;">🤝 人間関係（アスカラ独自）</div>
        ${contactNames.contact_id ? `<div style="font-size:13px;margin-bottom:4px;">依頼者: <span style="color:#0D7377;cursor:pointer;" data-goto="${caseData.contact_id}">${escapeHtml(contactNames.contact_id)}</span></div>` : '<div style="font-size:12px;color:#8a8a8a;">依頼者未設定</div>'}
        ${contactNames.referrer_id ? `<div style="font-size:13px;margin-bottom:4px;">紹介者: <span style="color:#B8860B;cursor:pointer;" data-goto="${caseData.referrer_id}">${escapeHtml(contactNames.referrer_id)}</span></div>` : ''}
        ${contactNames.end_user_id ? `<div style="font-size:13px;margin-bottom:4px;">エンドユーザー: <span style="color:#0D7377;cursor:pointer;" data-goto="${caseData.end_user_id}">${escapeHtml(contactNames.end_user_id)}</span></div>` : ''}
      </div>

      <!-- アスカラ独自：事業部振り分け -->
      <div style="background:#fff;border-radius:12px;padding:16px;border:1px solid #D6D3CB;margin-bottom:12px;">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
          <div style="font-size:13px;font-weight:700;color:#B8860B;">🔀 事業部振り分け（アスカラ独自）</div>
          <button id="btnAssignDiv" style="padding:4px 10px;border:1px solid #D6D3CB;border-radius:6px;background:#fff;cursor:pointer;font-size:11px;color:#0D7377;">振り分け</button>
        </div>
        ${divisions.length > 0 ? divisions.map(d => `
          <div style="display:flex;align-items:center;gap:8px;padding:4px 0;">
            ${divisionBadge(d.division)}
            <span style="font-size:11px;color:#8a8a8a;background:#f5f3ee;padding:2px 8px;border-radius:8px;">${escapeHtml(d.role)}</span>
          </div>
        `).join('') : '<div style="font-size:12px;color:#8a8a8a;">未振り分け</div>'}
      </div>

      <!-- アスカラ独自：メモ・履歴 -->
      <div style="background:#fff;border-radius:12px;padding:16px;border:1px solid #D6D3CB;margin-bottom:12px;">
        <div style="font-size:13px;font-weight:700;color:#B8860B;margin-bottom:8px;">📝 アスカラメモ</div>
        <button id="btnAddNote" style="width:100%;padding:10px;border:1px dashed #D6D3CB;border-radius:8px;background:transparent;color:#0D7377;font-size:13px;cursor:pointer;">＋ メモを追加</button>
        ${history.length > 0 ? history.map(h => `
          <div style="padding:8px 0;border-bottom:1px solid #eee;margin-top:8px;">
            <div style="font-size:12px;color:#8a8a8a;">${formatDateTime(h.created_at)} ${h.updated_by ? '/ ' + escapeHtml(h.updated_by) : ''}</div>
            ${h.note ? `<div style="font-size:13px;margin-top:2px;">${escapeHtml(h.note)}</div>` : ''}
          </div>
        `).join('') : ''}
      </div>

      <!-- アーカイブ・削除 -->
      <div style="display:flex;gap:8px;margin-bottom:16px;">
        <button id="btnArchive" style="flex:1;padding:8px;border:1px solid #9CA3AF;border-radius:8px;background:#fff;color:#9CA3AF;font-size:12px;cursor:pointer;">アーカイブ</button>
        <button id="btnDelete" style="flex:1;padding:8px;border:1px solid #DC2626;border-radius:8px;background:#fff;color:#DC2626;font-size:12px;cursor:pointer;">削除済みにする</button>
      </div>
    </div>
  `;

  // イベント
  container.querySelector('#btnBack')?.addEventListener('click', () => renderCaseList(container));

  container.querySelectorAll('[data-goto]').forEach(el => {
    el.addEventListener('click', () => navigate('contacts', { action: 'detail', id: el.dataset.goto }));
  });

  container.querySelector('#btnAssignDiv')?.addEventListener('click', () => {
    renderDivisionAssignment(container, caseData, divisions);
  });

  container.querySelector('#btnAddNote')?.addEventListener('click', () => {
    showNoteDialog(container, caseData);
  });

  container.querySelector('#btnArchive')?.addEventListener('click', () => {
    showConfirm('この案件をアーカイブしますか？', async () => {
      await updateCase(caseId, { status: 'アーカイブ' });
      showToast('アーカイブしました');
      renderCaseList(container);
    });
  });

  container.querySelector('#btnDelete')?.addEventListener('click', () => {
    showConfirm('この案件を削除済みにしますか？\nデータは残ります。', async () => {
      await updateCase(caseId, { status: '削除済み' });
      showToast('削除済みにしました');
      renderCaseList(container);
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
    await addCaseHistory({
      case_id: caseData.id,
      status: caseData.status,
      note: text,
      updated_by: staff?.name || null,
    });
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
        <div style="font-size:13px;color:#5a6272;margin-bottom:12px;">案件: <strong>${escapeHtml(caseData.title)}</strong></div>

        ${CONFIG.DIVISIONS.map(div => {
          const isSelected = !!selected[div];
          const role = selected[div] || '並列';
          return `
            <div style="padding:12px;border:1px solid ${isSelected ? '#0D7377' : '#D6D3CB'};border-radius:8px;margin-bottom:8px;background:${isSelected ? '#0D737708' : '#fff'};">
              <label style="display:flex;align-items:center;gap:8px;cursor:pointer;">
                <input type="checkbox" class="divCheck" data-div="${div}" ${isSelected ? 'checked' : ''} style="width:18px;height:18px;">
                <span style="font-weight:600;">${div}</span>
              </label>
              ${isSelected ? `
                <div style="padding-left:26px;margin-top:8px;">
                  <select class="divRole" data-div="${div}" style="padding:6px 10px;border:1px solid #D6D3CB;border-radius:6px;font-size:13px;">
                    ${CONFIG.DIVISION_ROLES.map(r => `<option value="${r}" ${role === r ? 'selected' : ''}>${r}</option>`).join('')}
                  </select>
                </div>
              ` : ''}
            </div>
          `;
        }).join('')}

        <button id="btnSaveDiv" style="width:100%;padding:12px;border-radius:8px;background:#1B3A5C;color:#fff;border:none;font-size:14px;font-weight:600;cursor:pointer;margin-top:8px;">保存</button>
      </div>
    </div>
  `;

  container.querySelectorAll('.divCheck').forEach(cb => {
    cb.addEventListener('change', () => {
      if (cb.checked) { selected[cb.dataset.div] = '並列'; }
      else { delete selected[cb.dataset.div]; }
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
    showToast('事業部を保存しました');
    renderCaseDetail(container, caseData.id);
  });
}

// ============================================================
// 新規案件登録（boardに作成 + アスカラに紹介者情報を付加）
// ============================================================
function renderNewCase(container) {
  container.innerHTML = `
    <div class="fade-in">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:16px;">
        <button id="btnBack" style="padding:6px 12px;border:1px solid #D6D3CB;border-radius:8px;background:#fff;cursor:pointer;font-size:14px;">← 戻る</button>
        <div style="font-size:15px;font-weight:700;">新規案件</div>
      </div>

      <div style="background:#fff;border-radius:12px;padding:16px;border:1px solid #D6D3CB;">
        <div style="text-align:center;padding:24px 0;">
          <div style="font-size:48px;margin-bottom:12px;">📋</div>
          <p style="font-size:14px;color:#5a6272;margin-bottom:16px;">案件の作成・見積・請求はboardで行います</p>
          <a href="https://the-board.jp/projects/new" target="_blank"
            style="display:inline-block;padding:12px 24px;background:#0078D4;color:#fff;border-radius:8px;font-size:14px;font-weight:600;text-decoration:none;">
            boardで新規案件を作成 →
          </a>
          <p style="font-size:12px;color:#8a8a8a;margin-top:16px;">boardで作成した案件は自動的にアスカラに同期されます</p>
        </div>
      </div>
    </div>
  `;

  container.querySelector('#btnBack')?.addEventListener('click', () => renderCaseList(container));
}
