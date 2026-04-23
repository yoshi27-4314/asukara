/**
 * アスカラ - 共通UIコンポーネント
 */

// --- トースト通知 ---
let toastTimeout = null;
export function showToast(message, duration = 3000) {
  let toast = document.getElementById('toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'toast';
    toast.style.cssText = 'position:fixed;bottom:80px;left:50%;transform:translateX(-50%);background:#ffffff;color:#1B3A5C;padding:10px 20px;border-radius:8px;font-size:14px;z-index:9999;opacity:0;transition:opacity 0.3s;max-width:90%;text-align:center;pointer-events:none;box-shadow:0 4px 16px rgba(27,58,92,0.15);border:1px solid #dde0e6;';
    document.body.appendChild(toast);
  }
  toast.textContent = message;
  toast.style.opacity = '1';
  clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => { toast.style.opacity = '0'; }, duration);
}

// --- ローディング ---
export function showLoading(container, text = '読み込み中...') {
  container.innerHTML = `
    <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;padding:40px;color:#5a6272;">
      <div class="spinner" style="width:32px;height:32px;border:3px solid #dde0e6;border-top-color:#1B3A5C;border-radius:50%;animation:spin 0.8s linear infinite;"></div>
      <p style="margin-top:12px;font-size:13px;">${text}</p>
    </div>
  `;
}

// --- 確認ダイアログ ---
export function showConfirm(message, onConfirm, onCancel) {
  const overlay = document.createElement('div');
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(27,58,92,0.5);z-index:10000;display:flex;align-items:center;justify-content:center;padding:20px;';
  overlay.innerHTML = `
    <div style="background:#ffffff;border-radius:16px;padding:24px;max-width:320px;width:100%;text-align:center;box-shadow:0 8px 32px rgba(27,58,92,0.2);">
      <p style="color:#1B3A5C;font-size:15px;margin-bottom:20px;line-height:1.5;">${message}</p>
      <div style="display:flex;gap:12px;">
        <button id="confirmCancel" style="flex:1;padding:12px;border-radius:8px;background:#F0F2F5;color:#5a6272;border:none;font-size:14px;cursor:pointer;">キャンセル</button>
        <button id="confirmOk" style="flex:1;padding:12px;border-radius:8px;background:#1B3A5C;color:#fff;border:none;font-size:14px;font-weight:bold;cursor:pointer;">OK</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
  overlay.querySelector('#confirmOk').addEventListener('click', () => { overlay.remove(); onConfirm?.(); });
  overlay.querySelector('#confirmCancel').addEventListener('click', () => { overlay.remove(); onCancel?.(); });
}

// --- ステータスバッジ ---
export function statusBadge(status) {
  const colors = {
    '受付': '#1B3A5C',
    '現地調査': '#6366F1',
    'ヒアリング': '#0D7377',
    '振り分け': '#D97706',
    '同行紹介': '#B8860B',
    '事業部対応中': '#2563EB',
    '完了確認': '#B8860B',
    '紹介獲得': '#059669',
    '保留': '#6B7280',
    '失注': '#DC2626',
    'フォロー中': '#7C3AED',
  };
  const highlighted = ['同行紹介', '完了確認', '紹介獲得'];
  const color = colors[status] || '#5a6272';
  const bold = highlighted.includes(status);
  const bgOpacity = bold ? '22' : '14';
  const border = bold ? `border:1px solid ${color}40;` : '';
  return `<span style="display:inline-block;padding:2px 8px;border-radius:10px;font-size:11px;font-weight:bold;background:${color}${bgOpacity};color:${color};${border}">${status}</span>`;
}

// --- 日付フォーマット ---
export function formatDate(dateStr) {
  if (!dateStr) return '--';
  const d = new Date(dateStr);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

export function formatDateTime(dateStr) {
  if (!dateStr) return '--';
  const d = new Date(dateStr);
  return `${d.getMonth() + 1}/${d.getDate()} ${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`;
}

// --- 金額フォーマット ---
export function formatPrice(num) {
  if (num == null || isNaN(num)) return '--';
  return '\u00A5' + Number(num).toLocaleString();
}

// --- 空状態表示 ---
export function emptyState(icon, message) {
  return `
    <div style="text-align:center;padding:60px 20px;color:#8a8a8a;">
      <div style="font-size:48px;margin-bottom:12px;">${icon}</div>
      <p style="font-size:14px;">${message}</p>
    </div>
  `;
}

// --- HTMLエスケープ ---
export function escapeHtml(str) {
  if (!str) return '';
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// --- 連絡先タイプバッジ ---
export function contactTypeBadge(type) {
  const colors = {
    '取引先': '#1B3A5C',
    '紹介者': '#B8860B',
    'エンドユーザー': '#0D7377',
    '提携士業': '#7C3AED',
    '自社スタッフ': '#059669',
  };
  const color = colors[type] || '#5a6272';
  return `<span style="display:inline-block;padding:2px 8px;border-radius:10px;font-size:11px;font-weight:bold;background:${color}14;color:${color};">${type}</span>`;
}

// --- 事業部バッジ ---
export function divisionBadge(division) {
  const colors = {
    'テイクバック': '#1B3A5C',
    'クリアメンテ': '#0D7377',
    'AIX事業部': '#7C3AED',
    '提携士業': '#B8860B',
  };
  const color = colors[division] || '#5a6272';
  return `<span style="display:inline-block;padding:2px 8px;border-radius:10px;font-size:11px;font-weight:bold;background:${color}14;color:${color};">${division}</span>`;
}
