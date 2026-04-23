/**
 * アスカラ - 案件モジュール
 * 案件の登録・一覧・ステータス管理・事業部振り分け
 */
import { CONFIG } from '../core/config.js';
import {
  getCases, getCase, createCase, updateCase, deleteCase,
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

// ============================================================
// メインエントリ
// ============================================================
export function renderCases(container, params = {}) {
  if (params.action === 'new') {
    renderCaseWizard(container);
  } else if (params.action === 'detail' && params.id) {
    renderCaseDetail(container, params.id);
  } else if (params.action === 'edit' && params.id) {
    renderCaseEdit(container, params.id);
  } else {
    renderCaseList(container);
  }
}

// ============================================================
// 案件一覧
// ============================================================
async function renderCaseList(container, activeFilter = '全て') {
  showLoading(container, '案件を読み込み中...');

  const [cases, statusCounts] = await Promise.all([
    getCases({ limit: 200 }),
    getCaseStatusCounts(),
  ]);

  function render(filter) {
    let filtered = cases;
    if (filter !== '全て') {
      filtered = cases.filter(c => c.status === filter);
    }

    const allTabs = ['全て', ...CONFIG.CASE_STATUS_FLOW, '保留', '失注', 'フォロー中'];

    container.innerHTML = `
      <div class="fade-in">
        <div style="display:flex;gap:8px;margin-bottom:12px;">
          <input type="search" id="caseSearch" placeholder="案件名で検索..."
            style="flex:1;padding:10px 12px;border:1px solid #D6D3CB;border-radius:8px;font-size:14px;background:#fff;">
        </div>

        <div style="display:flex;gap:6px;overflow-x:auto;padding-bottom:8px;margin-bottom:12px;">
          ${allTabs.map(t => {
            const count = t === '全て' ? (statusCounts._total || 0) : (statusCounts[t] || 0);
            const isHighlight = ['同行紹介', '完了確認', '紹介獲得'].includes(t);
            return `
              <button class="filter-tab ${t === filter ? 'active' : ''}" data-filter="${t}" style="${isHighlight && t !== filter ? 'border-color:#B8860B;color:#B8860B;' : ''}">
                ${t}${count > 0 ? ' <span style="font-size:10px;">(' + count + ')</span>' : ''}
              </button>
            `;
          }).join('')}
        </div>

        <div id="caseListBody">
          ${filtered.length > 0 ? filtered.map(c => `
            <div class="card" data-case-id="${c.id}">
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
            </div>
          `).join('') : emptyState('📋', filter === '全て' ? '案件はまだありません' : `「${filter}」の案件はありません`)}
        </div>
      </div>
      <button class="fab" id="fabAddCase">＋</button>
    `;

    // イベント
    container.querySelectorAll('.filter-tab').forEach(btn => {
      btn.addEventListener('click', () => render(btn.dataset.filter));
    });
    container.querySelector('#caseSearch')?.addEventListener('input', (e) => {
      const q = e.target.value.toLowerCase();
      const body = document.getElementById('caseListBody');
      if (!body) return;
      const cards = body.querySelectorAll('[data-case-id]');
      cards.forEach(card => {
        const text = card.textContent.toLowerCase();
        card.style.display = text.includes(q) ? '' : 'none';
      });
    });
    container.querySelector('#fabAddCase')?.addEventListener('click', () => renderCaseWizard(container));
    container.querySelectorAll('[data-case-id]').forEach(el => {
      el.addEventListener('click', () => renderCaseDetail(container, el.dataset.caseId));
    });
  }

  render(activeFilter);
}

// ============================================================
// 案件詳細
// ============================================================
async function renderCaseDetail(container, caseId) {
  showLoading(container, '読み込み中...');

  const [caseData, history, divisions] = await Promise.all([
    getCase(caseId),
    getCaseHistory(caseId),
    getCaseDivisions(caseId),
  ]);

  if (!caseData) {
    container.innerHTML = emptyState('❌', '案件が見つかりません');
    return;
  }

  // 関係者の名前を取得
  const contactNames = {};
  for (const field of ['contact_id', 'end_user_id', 'referrer_id', 'staff_id']) {
    if (caseData[field]) {
      const c = await getContact(caseData[field]);
      contactNames[field] = c?.name || '不明';
    }
  }

  // ステータスフローバー
  const flow = CONFIG.CASE_STATUS_FLOW;
  const currentIdx = flow.indexOf(caseData.status);
  const isSpecialStatus = ['保留', '失注', 'フォロー中'].includes(caseData.status);

  const flowHtml = flow.map((status, i) => {
    const isCompleted = !isSpecialStatus && currentIdx >= 0 && i < currentIdx;
    const isCurrent = !isSpecialStatus && i === currentIdx;
    const isHighlight = ['同行紹介', '完了確認', '紹介獲得'].includes(status);
    const icons = ['📞', '📍', '🎤', '🔀', '🤝', '🏗️', '🔍', '🤝'];

    let dotStyle = 'width:32px;height:32px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:14px;';
    let labelStyle = 'font-size:9px;text-align:center;line-height:1.2;max-width:52px;';

    if (isCompleted) {
      dotStyle += 'background:#059669;color:#fff;';
      labelStyle += 'color:#059669;';
    } else if (isCurrent) {
      dotStyle += 'background:#B8860B;color:#fff;transform:scale(1.15);box-shadow:0 2px 8px rgba(184,134,11,0.3);';
      labelStyle += 'color:#B8860B;font-weight:bold;';
    } else {
      dotStyle += `background:#f5f3ee;border:2px solid ${isHighlight ? '#B8860B40' : '#D6D3CB'};color:#8a8a8a;`;
      labelStyle += 'color:#8a8a8a;';
    }

    const line = i < flow.length - 1 ? `<div style="width:12px;height:2px;background:${isCompleted ? '#059669' : '#D6D3CB'};flex-shrink:0;"></div>` : '';

    return `
      <div style="display:flex;align-items:center;flex-shrink:0;">
        <div style="display:flex;flex-direction:column;align-items:center;gap:4px;">
          <div style="${dotStyle}">${isCompleted ? '✓' : icons[i]}</div>
          <div style="${labelStyle}">${status}</div>
        </div>
        ${line}
      </div>
    `;
  }).join('');

  // 次のステータス
  const nextStatus = !isSpecialStatus && currentIdx >= 0 && currentIdx < flow.length - 1 ? flow[currentIdx + 1] : null;

  container.innerHTML = `
    <div class="fade-in">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:12px;">
        <button id="btnBack" style="padding:6px 12px;border:1px solid #D6D3CB;border-radius:8px;background:#fff;cursor:pointer;font-size:14px;">← 戻る</button>
        <div style="flex:1;"></div>
        <button id="btnEdit" style="padding:6px 12px;border:1px solid #D6D3CB;border-radius:8px;background:#fff;cursor:pointer;font-size:13px;">編集</button>
        <button id="btnDelete" style="padding:6px 12px;border:1px solid #DC2626;border-radius:8px;background:#fff;color:#DC2626;cursor:pointer;font-size:13px;">削除</button>
      </div>

      <!-- タイトル + ステータス -->
      <div style="background:#fff;border-radius:12px;padding:16px;border:1px solid #D6D3CB;margin-bottom:12px;">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
          <div style="font-size:18px;font-weight:700;">${escapeHtml(caseData.title)}</div>
          ${statusBadge(caseData.status)}
        </div>
        ${isSpecialStatus ? `<div style="font-size:12px;color:#DC2626;margin-bottom:8px;">※ ${caseData.status}</div>` : ''}
      </div>

      <!-- ステータスフロー -->
      <div style="display:flex;align-items:center;gap:0;overflow-x:auto;padding:12px 0;margin-bottom:12px;">
        ${flowHtml}
      </div>

      <!-- 基本情報 -->
      <div style="background:#fff;border-radius:12px;padding:16px;border:1px solid #D6D3CB;margin-bottom:12px;">
        <div style="font-size:13px;font-weight:700;color:#5a6272;margin-bottom:8px;">基本情報</div>
        ${caseData.description ? `<div style="font-size:13px;margin-bottom:6px;">${escapeHtml(caseData.description)}</div>` : ''}
        ${caseData.category ? `<div style="font-size:12px;color:#5a6272;margin-bottom:4px;">分類: ${escapeHtml(caseData.category)}</div>` : ''}
        ${caseData.site_address ? `<div style="font-size:12px;color:#5a6272;margin-bottom:4px;">📍 ${escapeHtml(caseData.site_address)}</div>` : ''}
        ${caseData.contract_type ? `<div style="font-size:12px;color:#5a6272;margin-bottom:4px;">契約: ${escapeHtml(caseData.contract_type)}</div>` : ''}
        ${caseData.revenue ? `<div style="font-size:14px;font-weight:700;color:#059669;">売上: ${formatPrice(caseData.revenue)}</div>` : ''}
        ${caseData.referral_count ? `<div style="font-size:12px;color:#B8860B;">紹介獲得: ${caseData.referral_count}件</div>` : ''}
      </div>

      <!-- 関係者 -->
      <div style="background:#fff;border-radius:12px;padding:16px;border:1px solid #D6D3CB;margin-bottom:12px;">
        <div style="font-size:13px;font-weight:700;color:#5a6272;margin-bottom:8px;">関係者</div>
        ${contactNames.contact_id ? `<div style="font-size:13px;margin-bottom:4px;" data-goto-contact="${caseData.contact_id}">👤 依頼者: <span style="color:#0D7377;cursor:pointer;">${escapeHtml(contactNames.contact_id)}</span></div>` : ''}
        ${contactNames.end_user_id ? `<div style="font-size:13px;margin-bottom:4px;" data-goto-contact="${caseData.end_user_id}">🏠 エンドユーザー: <span style="color:#0D7377;cursor:pointer;">${escapeHtml(contactNames.end_user_id)}</span></div>` : ''}
        ${contactNames.referrer_id ? `<div style="font-size:13px;margin-bottom:4px;" data-goto-contact="${caseData.referrer_id}">🤝 紹介者: <span style="color:#0D7377;cursor:pointer;">${escapeHtml(contactNames.referrer_id)}</span></div>` : ''}
        ${contactNames.staff_id ? `<div style="font-size:13px;margin-bottom:4px;">📋 担当: ${escapeHtml(contactNames.staff_id)}</div>` : ''}
      </div>

      <!-- 事業部 -->
      <div style="background:#fff;border-radius:12px;padding:16px;border:1px solid #D6D3CB;margin-bottom:12px;">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
          <div style="font-size:13px;font-weight:700;color:#5a6272;">事業部</div>
          <button id="btnAssignDiv" style="padding:4px 10px;border:1px solid #D6D3CB;border-radius:6px;background:#fff;cursor:pointer;font-size:11px;color:#0D7377;">振り分け</button>
        </div>
        ${divisions.length > 0 ? divisions.map(d => `
          <div style="display:flex;align-items:center;gap:8px;padding:6px 0;">
            ${divisionBadge(d.division)}
            <span style="font-size:11px;color:#8a8a8a;background:#f5f3ee;padding:2px 8px;border-radius:8px;">${escapeHtml(d.role)}</span>
          </div>
        `).join('') : '<div style="font-size:12px;color:#8a8a8a;">未振り分け</div>'}
      </div>

      <!-- アクションボタン -->
      <div style="display:flex;gap:8px;margin-bottom:16px;">
        ${nextStatus ? `<button id="btnAdvance" style="flex:1;padding:12px;border-radius:8px;background:#1B3A5C;color:#fff;border:none;font-size:14px;font-weight:600;cursor:pointer;">→ ${nextStatus}へ進める</button>` : ''}
        <button id="btnAddNote" style="${nextStatus ? '' : 'flex:1;'}padding:12px;border-radius:8px;background:#0D7377;color:#fff;border:none;font-size:14px;font-weight:600;cursor:pointer;">メモ追加</button>
      </div>

      ${!isSpecialStatus && currentIdx >= 0 ? `
        <div style="display:flex;gap:8px;margin-bottom:16px;">
          <button class="statusBtn" data-status="保留" style="flex:1;padding:8px;border:1px solid #6B7280;border-radius:8px;background:#fff;color:#6B7280;font-size:12px;cursor:pointer;">保留</button>
          <button class="statusBtn" data-status="失注" style="flex:1;padding:8px;border:1px solid #DC2626;border-radius:8px;background:#fff;color:#DC2626;font-size:12px;cursor:pointer;">失注</button>
          <button class="statusBtn" data-status="フォロー中" style="flex:1;padding:8px;border:1px solid #7C3AED;border-radius:8px;background:#fff;color:#7C3AED;font-size:12px;cursor:pointer;">フォロー中</button>
        </div>
      ` : ''}

      <!-- 履歴 -->
      <div style="font-size:13px;font-weight:700;color:#5a6272;margin-bottom:8px;">履歴</div>
      ${history.length > 0 ? history.map(h => `
        <div style="display:flex;gap:8px;padding:8px 0;border-bottom:1px solid #eee;">
          <div style="width:4px;border-radius:2px;background:#D6D3CB;flex-shrink:0;"></div>
          <div>
            <div style="font-size:12px;">
              ${statusBadge(h.status)}
              <span style="color:#8a8a8a;margin-left:6px;">${formatDateTime(h.created_at)}</span>
            </div>
            ${h.note ? `<div style="font-size:12px;color:#5a6272;margin-top:4px;">${escapeHtml(h.note)}</div>` : ''}
            ${h.updated_by ? `<div style="font-size:10px;color:#8a8a8a;margin-top:2px;">by ${escapeHtml(h.updated_by)}</div>` : ''}
          </div>
        </div>
      `).join('') : '<div style="font-size:12px;color:#8a8a8a;">履歴はまだありません</div>'}
    </div>
  `;

  // イベント
  container.querySelector('#btnBack')?.addEventListener('click', () => renderCaseList(container));
  container.querySelector('#btnEdit')?.addEventListener('click', () => renderCaseEdit(container, caseId));
  container.querySelector('#btnDelete')?.addEventListener('click', () => {
    showConfirm(`「${caseData.title}」を削除しますか？\nこの操作は元に戻せません。`, async () => {
      const ok = await deleteCase(caseId);
      if (ok) { showToast('削除しました'); renderCaseList(container); }
      else { showToast('削除に失敗しました'); }
    });
  });
  container.querySelector('#btnAssignDiv')?.addEventListener('click', () => renderDivisionAssignment(container, caseData, divisions));

  container.querySelector('#btnAdvance')?.addEventListener('click', () => {
    if (nextStatus === '紹介獲得') {
      renderReferralCompletion(container, caseData);
    } else {
      advanceStatus(container, caseData, nextStatus);
    }
  });

  container.querySelector('#btnAddNote')?.addEventListener('click', () => {
    showNoteDialog(container, caseData);
  });

  container.querySelectorAll('.statusBtn').forEach(btn => {
    btn.addEventListener('click', () => {
      advanceStatus(container, caseData, btn.dataset.status);
    });
  });

  container.querySelectorAll('[data-goto-contact]').forEach(el => {
    el.addEventListener('click', () => navigate('contacts', { action: 'detail', id: el.dataset.gotoContact }));
  });
}

// ============================================================
// ステータス進行
// ============================================================
function advanceStatus(container, caseData, newStatus) {
  showConfirm(`ステータスを「${newStatus}」に変更しますか？`, async () => {
    const staff = getCurrentStaff();
    await updateCase(caseData.id, { status: newStatus });
    await addCaseHistory({
      case_id: caseData.id,
      status: newStatus,
      note: `${caseData.status} → ${newStatus}`,
      updated_by: staff?.name || null,
    });
    showToast(`「${newStatus}」に変更しました`);
    renderCaseDetail(container, caseData.id);
  });
}

// ============================================================
// 紹介獲得完了（売上・紹介数入力）
// ============================================================
function renderReferralCompletion(container, caseData) {
  const overlay = document.createElement('div');
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(27,58,92,0.5);z-index:10000;display:flex;align-items:center;justify-content:center;padding:20px;';
  overlay.innerHTML = `
    <div style="background:#fff;border-radius:16px;padding:24px;max-width:360px;width:100%;box-shadow:0 8px 32px rgba(27,58,92,0.2);">
      <div style="font-size:16px;font-weight:700;margin-bottom:16px;text-align:center;color:#B8860B;">🤝 紹介獲得</div>
      <div class="form-group">
        <label>売上金額</label>
        <input type="number" id="refRevenue" value="${caseData.revenue || ''}" placeholder="0">
      </div>
      <div class="form-group">
        <label>紹介を何件いただいたか</label>
        <input type="number" id="refCount" value="${caseData.referral_count || 0}" placeholder="0">
      </div>
      <div class="form-group">
        <label>メモ</label>
        <textarea id="refNote" placeholder="完了メモ..."></textarea>
      </div>
      <div style="display:flex;gap:12px;">
        <button id="refCancel" style="flex:1;padding:12px;border-radius:8px;background:#f0f0f0;color:#5a6272;border:none;font-size:14px;cursor:pointer;">キャンセル</button>
        <button id="refSave" style="flex:1;padding:12px;border-radius:8px;background:#B8860B;color:#fff;border:none;font-size:14px;font-weight:600;cursor:pointer;">完了</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);

  overlay.querySelector('#refCancel').addEventListener('click', () => overlay.remove());
  overlay.querySelector('#refSave').addEventListener('click', async () => {
    const staff = getCurrentStaff();
    const revenue = parseInt(document.getElementById('refRevenue').value) || 0;
    const count = parseInt(document.getElementById('refCount').value) || 0;
    const note = document.getElementById('refNote').value.trim();

    await updateCase(caseData.id, {
      status: '紹介獲得',
      revenue,
      referral_count: count,
    });
    await addCaseHistory({
      case_id: caseData.id,
      status: '紹介獲得',
      note: `売上: ${formatPrice(revenue)} / 紹介: ${count}件${note ? ' / ' + note : ''}`,
      updated_by: staff?.name || null,
    });

    overlay.remove();
    showToast('紹介獲得を記録しました');
    renderCaseDetail(container, caseData.id);
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

      <div style="background:#fff;border-radius:12px;padding:16px;border:1px solid #D6D3CB;margin-bottom:12px;">
        <div style="font-size:13px;color:#5a6272;margin-bottom:12px;">
          案件: <strong>${escapeHtml(caseData.title)}</strong>
          ${caseData.category ? ` / ${escapeHtml(caseData.category)}` : ''}
        </div>

        ${CONFIG.DIVISIONS.map(div => {
          const isSelected = !!selected[div];
          const role = selected[div] || '並列';
          return `
            <div style="padding:12px;border:1px solid ${isSelected ? '#0D7377' : '#D6D3CB'};border-radius:8px;margin-bottom:8px;background:${isSelected ? '#0D737708' : '#fff'};">
              <label style="display:flex;align-items:center;gap:8px;margin-bottom:${isSelected ? '8px' : '0'};cursor:pointer;">
                <input type="checkbox" class="divCheck" data-div="${div}" ${isSelected ? 'checked' : ''} style="width:18px;height:18px;">
                <span style="font-weight:600;">${div}</span>
              </label>
              ${isSelected ? `
                <div style="padding-left:26px;">
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

  // チェックボックス変更で画面を再描画
  container.querySelectorAll('.divCheck').forEach(cb => {
    cb.addEventListener('change', () => {
      if (cb.checked) {
        selected[cb.dataset.div] = '並列';
      } else {
        delete selected[cb.dataset.div];
      }
      // 簡易的に再描画
      renderDivisionAssignment(container, caseData, Object.entries(selected).map(([division, role]) => ({ division, role })));
    });
  });

  container.querySelector('#btnBack')?.addEventListener('click', () => renderCaseDetail(container, caseData.id));

  container.querySelector('#btnSaveDiv')?.addEventListener('click', async () => {
    // 現在の選択を取得
    const divs = [];
    container.querySelectorAll('.divCheck:checked').forEach(cb => {
      const div = cb.dataset.div;
      const roleEl = container.querySelector(`.divRole[data-div="${div}"]`);
      divs.push({ division: div, role: roleEl?.value || '並列' });
    });

    const success = await setCaseDivisions(caseData.id, divs);
    if (success) {
      // 振り分けステータスなら同行紹介へ進める
      if (caseData.status === '振り分け' && divs.length > 0) {
        const staff = getCurrentStaff();
        await updateCase(caseData.id, { status: '同行紹介' });
        await addCaseHistory({
          case_id: caseData.id,
          status: '同行紹介',
          note: `事業部振り分け: ${divs.map(d => d.division + '(' + d.role + ')').join(', ')}`,
          updated_by: staff?.name || null,
        });
      }
      showToast('事業部を保存しました');
      renderCaseDetail(container, caseData.id);
    } else {
      showToast('保存に失敗しました');
    }
  });
}

// ============================================================
// 案件登録ウィザード（3ステップ）
// ============================================================
async function renderCaseWizard(container, step = 1, data = {}) {
  if (step === 1) {
    // Step 1: 受付（依頼元の選択 — 顧客→支社→担当者の階層検索）
    const contacts = await getContacts({ limit: 700 });
    // 法人（取引先）と個人を分ける
    const companies = contacts.filter(c => c.type === '取引先' && !c.registered_by?.includes('担当者'));
    const persons = contacts.filter(c => c.type !== '取引先' || c.registered_by?.includes('担当者'));

    container.innerHTML = `
      <div class="fade-in">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">
          <button id="btnBack" style="padding:6px 12px;border:1px solid #D6D3CB;border-radius:8px;background:#fff;cursor:pointer;font-size:14px;">← 戻る</button>
          <div style="font-size:15px;font-weight:700;">新規案件登録</div>
        </div>

        <div style="display:flex;justify-content:center;gap:8px;padding:12px 0;">
          <div style="width:24px;height:8px;border-radius:4px;background:#0D7377;"></div>
          <div style="width:8px;height:8px;border-radius:4px;background:#D6D3CB;"></div>
          <div style="width:8px;height:8px;border-radius:4px;background:#D6D3CB;"></div>
        </div>

        <div style="background:#fff;border-radius:12px;padding:16px;border:1px solid #D6D3CB;">
          <div style="font-size:14px;font-weight:700;margin-bottom:12px;">📞 Step 1: 受付 — 依頼元</div>

          <!-- 顧客検索（法人/個人） -->
          <div class="form-group">
            <label>顧客名 *（会社名 or 個人名を入力）</label>
            <input type="text" id="wizClientSearch" placeholder="美濃善、加藤、山田..." value="${data.contact_name ? escapeHtml(data.contact_name) : ''}">
            <div id="wizClientResults" style="max-height:200px;overflow-y:auto;margin-top:4px;"></div>
            <input type="hidden" id="wizContactId" value="${data.contact_id || ''}">
          </div>

          <!-- 選択された顧客の表示 -->
          <div id="wizSelectedInfo" style="display:${data.contact_id ? 'block' : 'none'};background:#f5f3ee;border-radius:8px;padding:12px;margin-bottom:12px;">
            <div style="font-size:13px;font-weight:700;color:#1B3A5C;" id="wizSelectedName">${data.contact_name ? escapeHtml(data.contact_name) : ''}</div>
            <div id="wizSelectedDetail" style="font-size:12px;color:#5a6272;margin-top:4px;"></div>
          </div>

          <!-- 担当者選択（顧客選択後に表示） -->
          <div id="wizContactPersonSection" style="display:none;">
            <div class="form-group">
              <label>担当者（いれば選択）</label>
              <select id="wizContactPerson" style="width:100%;padding:10px;border:1px solid #D6D3CB;border-radius:8px;font-size:14px;">
                <option value="">担当者なし</option>
              </select>
            </div>
          </div>

          <!-- 紹介者 -->
          <div class="form-group">
            <label>紹介者（いれば）</label>
            <input type="text" id="wizRefSearch" placeholder="名前で検索...">
            <div id="wizRefResults" style="max-height:150px;overflow-y:auto;margin-top:4px;"></div>
            <input type="hidden" id="wizRefId" value="${data.referrer_id || ''}">
            <div id="wizRefSelected" style="margin-top:4px;font-size:13px;color:#B8860B;font-weight:600;">
              ${data.referrer_name ? escapeHtml(data.referrer_name) : ''}
            </div>
          </div>

          <!-- エンドユーザー -->
          <div class="form-group">
            <label>
              <input type="checkbox" id="wizSameUser" ${data.same_end_user !== false ? 'checked' : ''} style="width:16px;height:16px;vertical-align:middle;">
              エンドユーザー = 依頼者と同じ
            </label>
          </div>
          <div id="wizEndUserSection" style="display:${data.same_end_user === false ? 'block' : 'none'};">
            <div class="form-group">
              <label>エンドユーザー</label>
              <input type="text" id="wizEndSearch" placeholder="名前で検索...">
              <div id="wizEndResults" style="max-height:150px;overflow-y:auto;margin-top:4px;"></div>
              <input type="hidden" id="wizEndId" value="${data.end_user_id || ''}">
            </div>
          </div>

          <button id="btnNext1" style="width:100%;padding:12px;border-radius:8px;background:#1B3A5C;color:#fff;border:none;font-size:14px;font-weight:600;cursor:pointer;margin-top:8px;">次へ →</button>
        </div>
      </div>
    `;

    // --- 顧客検索（階層対応） ---
    const clientInput = container.querySelector('#wizClientSearch');
    const clientResults = container.querySelector('#wizClientResults');

    clientInput?.addEventListener('input', () => {
      const q = clientInput.value.toLowerCase();
      if (!q || q.length < 1) { clientResults.innerHTML = ''; return; }

      // 全contactsから検索（法人優先、noteの中の情報も検索対象）
      const matches = contacts.filter(c => {
        const searchText = `${c.name || ''} ${c.name_kana || ''} ${c.note || ''}`.toLowerCase();
        return searchText.includes(q) && !c.registered_by?.includes('担当者');
      }).slice(0, 15);

      clientResults.innerHTML = matches.map(c => {
        const typeLabel = c.type === '取引先' ? '<span style="color:#1B3A5C;font-size:10px;background:#1B3A5C14;padding:1px 6px;border-radius:8px;">法人</span>' :
                          '<span style="color:#0D7377;font-size:10px;background:#0D737714;padding:1px 6px;border-radius:8px;">個人</span>';
        const phone = c.phone ? `<span style="color:#8a8a8a;font-size:11px;"> 📞${c.phone}</span>` : '';
        return `
          <div data-client-id="${c.id}" data-client-name="${escapeHtml(c.name)}" data-client-type="${c.type}"
            style="padding:10px;border:1px solid #eee;border-radius:8px;margin-bottom:4px;cursor:pointer;display:flex;justify-content:space-between;align-items:center;">
            <div>
              <span style="font-weight:600;font-size:14px;">${escapeHtml(c.name)}</span>${phone}
            </div>
            ${typeLabel}
          </div>
        `;
      }).join('') || '<div style="padding:8px;color:#8a8a8a;font-size:12px;">見つかりません</div>';

      clientResults.querySelectorAll('[data-client-id]').forEach(el => {
        el.addEventListener('click', () => {
          const clientId = el.dataset.clientId;
          const clientName = el.dataset.clientName;
          const clientType = el.dataset.clientType;

          document.getElementById('wizContactId').value = clientId;
          clientInput.value = clientName;
          clientResults.innerHTML = '';

          // 選択表示
          const infoDiv = document.getElementById('wizSelectedInfo');
          infoDiv.style.display = 'block';
          document.getElementById('wizSelectedName').textContent = clientName;

          // この顧客に紐付く担当者を探す
          const relatedContacts = contacts.filter(ct =>
            ct.registered_by?.includes('担当者') &&
            ct.tags?.some(t => t.includes('board_client_id:' + (el.dataset.clientId || '')))
          );

          // noteからboard_idを取り出して照合する方法もある
          const clientBoardId = contacts.find(ct => ct.id === clientId)?.tags?.find(t => t.startsWith('board_id:'))?.replace('board_id:', '') || '';

          const matchedContacts = contacts.filter(ct =>
            ct.registered_by === 'board移行（担当者）' &&
            ct.tags?.some(t => t === 'board_client_id:' + clientBoardId)
          );

          const personSection = document.getElementById('wizContactPersonSection');
          const personSelect = document.getElementById('wizContactPerson');

          if (matchedContacts.length > 0) {
            personSection.style.display = 'block';
            personSelect.innerHTML = '<option value="">担当者を選択...</option>' +
              matchedContacts.map(ct => `<option value="${ct.id}">${escapeHtml(ct.name)}${ct.position ? ' (' + escapeHtml(ct.position) + ')' : ''}</option>`).join('');
            document.getElementById('wizSelectedDetail').textContent = `担当者 ${matchedContacts.length}名`;
          } else {
            personSection.style.display = 'none';
            document.getElementById('wizSelectedDetail').textContent = '';
          }
        });
      });
    });

    // 紹介者・エンドユーザーの検索
    setupContactSearch('wizRefSearch', 'wizRefResults', 'wizRefId', 'wizRefSelected', contacts);
    setupContactSearch('wizEndSearch', 'wizEndResults', 'wizEndId', null, contacts);

    container.querySelector('#wizSameUser')?.addEventListener('change', (e) => {
      document.getElementById('wizEndUserSection').style.display = e.target.checked ? 'none' : 'block';
    });

    container.querySelector('#btnBack')?.addEventListener('click', () => renderCaseList(container));
    container.querySelector('#btnNext1')?.addEventListener('click', () => {
      const contactId = document.getElementById('wizContactId').value;
      if (!contactId) { showToast('顧客を選択してください'); return; }

      const personId = document.getElementById('wizContactPerson')?.value || null;
      const sameUser = document.getElementById('wizSameUser').checked;
      const selectedContact = contacts.find(c => c.id === contactId);

      const wizData = {
        ...data,
        contact_id: contactId,
        contact_name: selectedContact?.name || clientInput.value,
        contact_person_id: personId,
        referrer_id: document.getElementById('wizRefId').value || null,
        referrer_name: document.getElementById('wizRefSelected')?.textContent?.trim() || '',
        same_end_user: sameUser,
        end_user_id: sameUser ? contactId : (document.getElementById('wizEndId')?.value || null),
      };

      renderCaseWizard(container, 2, wizData);
    });

  } else if (step === 2) {
    // Step 2: ヒアリング
    container.innerHTML = `
      <div class="fade-in">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">
          <button id="btnPrev" style="padding:6px 12px;border:1px solid #D6D3CB;border-radius:8px;background:#fff;cursor:pointer;font-size:14px;">← 戻る</button>
          <div style="font-size:15px;font-weight:700;">新規案件登録</div>
        </div>

        <div style="display:flex;justify-content:center;gap:8px;padding:12px 0;">
          <div style="width:8px;height:8px;border-radius:4px;background:#059669;"></div>
          <div style="width:24px;height:8px;border-radius:4px;background:#0D7377;"></div>
          <div style="width:8px;height:8px;border-radius:4px;background:#D6D3CB;"></div>
        </div>

        <div style="background:#fff;border-radius:12px;padding:16px;border:1px solid #D6D3CB;">
          <div style="font-size:14px;font-weight:700;margin-bottom:12px;">🎤 Step 2: ヒアリング</div>

          <div class="form-group">
            <label>案件名 *</label>
            <input type="text" id="wizTitle" value="${escapeHtml(data.title || '')}" placeholder="例: 加藤邸 片付け">
          </div>

          <div class="form-group">
            <label>困りごとの内容</label>
            <textarea id="wizDesc" placeholder="お客さんの困りごとを記録...">${escapeHtml(data.description || '')}</textarea>
          </div>

          <div class="form-group">
            <label>困りごと分類</label>
            <select id="wizCategory">
              <option value="">選択してください</option>
              ${CONFIG.CATEGORIES.map(c => `<option value="${c.name}" ${data.category === c.name ? 'selected' : ''}>${c.name} — ${c.example}</option>`).join('')}
            </select>
          </div>

          <div class="form-group">
            <label>現地住所</label>
            <input type="text" id="wizAddress" value="${escapeHtml(data.site_address || '')}" placeholder="岐阜県岐阜市...">
          </div>

          <button id="btnNext2" style="width:100%;padding:12px;border-radius:8px;background:#1B3A5C;color:#fff;border:none;font-size:14px;font-weight:600;cursor:pointer;margin-top:8px;">次へ → 確認</button>
        </div>
      </div>
    `;

    container.querySelector('#btnPrev')?.addEventListener('click', () => renderCaseWizard(container, 1, data));
    container.querySelector('#btnNext2')?.addEventListener('click', () => {
      const title = document.getElementById('wizTitle').value.trim();
      if (!title) { showToast('案件名は必須です'); return; }

      const wizData = {
        ...data,
        title,
        description: document.getElementById('wizDesc').value.trim() || null,
        category: document.getElementById('wizCategory').value || null,
        site_address: document.getElementById('wizAddress').value.trim() || null,
      };

      renderCaseWizard(container, 3, wizData);
    });

  } else if (step === 3) {
    // Step 3: 確認
    container.innerHTML = `
      <div class="fade-in">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">
          <button id="btnPrev" style="padding:6px 12px;border:1px solid #D6D3CB;border-radius:8px;background:#fff;cursor:pointer;font-size:14px;">← 戻る</button>
          <div style="font-size:15px;font-weight:700;">新規案件登録</div>
        </div>

        <div style="display:flex;justify-content:center;gap:8px;padding:12px 0;">
          <div style="width:8px;height:8px;border-radius:4px;background:#059669;"></div>
          <div style="width:8px;height:8px;border-radius:4px;background:#059669;"></div>
          <div style="width:24px;height:8px;border-radius:4px;background:#0D7377;"></div>
        </div>

        <div style="background:#fff;border-radius:12px;padding:16px;border:1px solid #D6D3CB;">
          <div style="font-size:14px;font-weight:700;margin-bottom:12px;">確認</div>

          <div style="font-size:13px;line-height:2;">
            <div><strong>案件名:</strong> ${escapeHtml(data.title)}</div>
            <div><strong>依頼者:</strong> ${escapeHtml(data.contact_name || '---')}</div>
            ${data.referrer_name ? `<div><strong>紹介者:</strong> ${escapeHtml(data.referrer_name)}</div>` : ''}
            ${data.category ? `<div><strong>分類:</strong> ${escapeHtml(data.category)}</div>` : ''}
            ${data.site_address ? `<div><strong>現地:</strong> ${escapeHtml(data.site_address)}</div>` : ''}
            ${data.description ? `<div><strong>内容:</strong> ${escapeHtml(data.description)}</div>` : ''}
          </div>

          <button id="btnCreate" style="width:100%;padding:14px;border-radius:8px;background:#0D7377;color:#fff;border:none;font-size:15px;font-weight:700;cursor:pointer;margin-top:16px;">案件を登録する</button>
        </div>
      </div>
    `;

    container.querySelector('#btnPrev')?.addEventListener('click', () => renderCaseWizard(container, 2, data));
    container.querySelector('#btnCreate')?.addEventListener('click', async () => {
      const staff = getCurrentStaff();

      const caseData = {
        title: data.title,
        description: data.description,
        site_address: data.site_address,
        category: data.category,
        status: '受付',
        contact_id: data.contact_id,
        end_user_id: data.end_user_id || data.contact_id,
        referrer_id: data.referrer_id || null,
        staff_id: null, // 担当者はまだ未設定
      };

      try {
        const result = await createCase(caseData);
        if (result) {
          await addCaseHistory({
            case_id: result.id,
            status: '受付',
            note: '案件登録',
            updated_by: staff?.name || null,
          });
          showToast('案件を登録しました');
          renderCaseDetail(container, result.id);
        } else {
          showToast('登録に失敗しました');
        }
      } catch (err) {
        console.error(err);
        showToast('エラーが発生しました');
      }
    });
  }
}

// ============================================================
// 案件編集フォーム
// ============================================================
async function renderCaseEdit(container, caseId) {
  showLoading(container, '読み込み中...');

  const caseData = await getCase(caseId);
  if (!caseData) {
    container.innerHTML = emptyState('❌', '案件が見つかりません');
    return;
  }

  container.innerHTML = `
    <div class="fade-in">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:16px;">
        <button id="btnBack" style="padding:6px 12px;border:1px solid #D6D3CB;border-radius:8px;background:#fff;cursor:pointer;font-size:14px;">← 戻る</button>
        <div style="font-size:15px;font-weight:700;">案件編集</div>
      </div>

      <div style="background:#fff;border-radius:12px;padding:16px;border:1px solid #D6D3CB;">
        <div class="form-group">
          <label>案件名 *</label>
          <input type="text" id="editTitle" value="${escapeHtml(caseData.title)}">
        </div>
        <div class="form-group">
          <label>困りごとの内容</label>
          <textarea id="editDesc">${escapeHtml(caseData.description || '')}</textarea>
        </div>
        <div class="form-group">
          <label>分類</label>
          <select id="editCategory">
            <option value="">未選択</option>
            ${CONFIG.CATEGORIES.map(c => `<option value="${c.name}" ${caseData.category === c.name ? 'selected' : ''}>${c.name}</option>`).join('')}
          </select>
        </div>
        <div class="form-group">
          <label>現地住所</label>
          <input type="text" id="editAddress" value="${escapeHtml(caseData.site_address || '')}">
        </div>
        <div class="form-group">
          <label>契約形態</label>
          <select id="editContract">
            <option value="">未選択</option>
            ${CONFIG.CONTRACT_TYPES.map(t => `<option value="${t}" ${caseData.contract_type === t ? 'selected' : ''}>${t}</option>`).join('')}
          </select>
        </div>
        <div class="form-group">
          <label>売上金額</label>
          <input type="number" id="editRevenue" value="${caseData.revenue || ''}">
        </div>
        <div class="form-group">
          <label>紹介獲得数</label>
          <input type="number" id="editReferral" value="${caseData.referral_count || 0}">
        </div>
        <div class="form-group">
          <label>メモ</label>
          <textarea id="editNote">${escapeHtml(caseData.note || '')}</textarea>
        </div>

        <button id="btnSaveEdit" style="width:100%;padding:12px;border-radius:8px;background:#1B3A5C;color:#fff;border:none;font-size:14px;font-weight:600;cursor:pointer;">更新する</button>
      </div>
    </div>
  `;

  container.querySelector('#btnBack')?.addEventListener('click', () => renderCaseDetail(container, caseId));
  container.querySelector('#btnSaveEdit')?.addEventListener('click', async () => {
    const title = document.getElementById('editTitle').value.trim();
    if (!title) { showToast('案件名は必須です'); return; }

    const updates = {
      title,
      description: document.getElementById('editDesc').value.trim() || null,
      category: document.getElementById('editCategory').value || null,
      site_address: document.getElementById('editAddress').value.trim() || null,
      contract_type: document.getElementById('editContract').value || null,
      revenue: parseInt(document.getElementById('editRevenue').value) || 0,
      referral_count: parseInt(document.getElementById('editReferral').value) || 0,
      note: document.getElementById('editNote').value.trim() || null,
    };

    try {
      await updateCase(caseId, updates);
      showToast('更新しました');
      renderCaseDetail(container, caseId);
    } catch (err) {
      console.error(err);
      showToast('エラーが発生しました');
    }
  });
}

// ============================================================
// ユーティリティ: コンタクト検索セットアップ
// ============================================================
function setupContactSearch(inputId, resultsId, hiddenId, selectedId, contacts) {
  const input = document.getElementById(inputId);
  const results = document.getElementById(resultsId);
  if (!input || !results) return;

  input.addEventListener('input', () => {
    const q = input.value.toLowerCase();
    if (!q) { results.innerHTML = ''; return; }
    const matches = contacts.filter(c => (c.name || '').toLowerCase().includes(q)).slice(0, 8);
    results.innerHTML = matches.map(c => `
      <div data-sel-id="${c.id}" data-sel-name="${escapeHtml(c.name)}" style="padding:8px 10px;border:1px solid #eee;border-radius:6px;margin-bottom:4px;cursor:pointer;font-size:13px;">
        ${escapeHtml(c.name)} <span style="color:#8a8a8a;font-size:11px;">${escapeHtml(c.type || '')}</span>
      </div>
    `).join('');

    results.querySelectorAll('[data-sel-id]').forEach(el => {
      el.addEventListener('click', () => {
        document.getElementById(hiddenId).value = el.dataset.selId;
        input.value = el.dataset.selName;
        if (selectedId) {
          const selDiv = document.getElementById(selectedId);
          if (selDiv) selDiv.textContent = el.dataset.selName;
        }
        results.innerHTML = '';
      });
    });
  });
}
