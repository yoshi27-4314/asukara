/**
 * アスカラ - メインエントリポイント
 * モジュール構成: コンタクト(contacts) / 案件(cases)
 */
import { CONFIG } from './core/config.js';
import { initDB, getCaseStatusCounts, getContactStats, getCases } from './core/db.js';
import { getCurrentStaff, showLoginScreen, logout } from './core/auth.js';
import { registerRoute, navigate } from './core/router.js';
import { showToast, showLoading, statusBadge, formatPrice, emptyState, escapeHtml, formatDate } from './core/ui.js';
import { renderContacts } from './contacts/index.js';
import { renderCases } from './cases/index.js';

const app = document.getElementById('app');

// --- ルート登録 ---
registerRoute('home', renderHome);
registerRoute('contacts', (p) => { ensureShell('contacts'); renderContacts(getContentEl(), p); });
registerRoute('cases', (p) => { ensureShell('cases'); renderCases(getContentEl(), p); });
registerRoute('analytics', renderAnalytics);
registerRoute('settings', renderSettings);

function getContentEl() {
  return document.getElementById('mainContent') || app;
}

// --- アプリ起動 ---
async function boot() {
  const staff = getCurrentStaff();
  if (!staff) {
    showLoginScreen(app, () => boot());
    return;
  }

  if (!initDB()) {
    app.innerHTML = `<div style="padding:40px;text-align:center;color:#DC2626;">
      <p>データベースに接続できません</p>
      <p style="font-size:12px;color:#5a6272;margin-top:8px;">ページを再読み込みしてください</p>
    </div>`;
    return;
  }

  renderShell();
  navigate('home');
}

// --- シェル（ヘッダー + ボトムナビ + コンテンツ領域） ---
function renderShell() {
  const staff = getCurrentStaff();
  app.innerHTML = `
    <div class="header">
      <div>
        <div class="header-title">アスカラ</div>
        <div class="header-subtitle">${escapeHtml(staff.name)} | v${CONFIG.APP_VERSION}</div>
      </div>
      <button class="header-action" id="headerSettings">⚙️</button>
    </div>
    <div class="main-content" id="mainContent"></div>
    <nav class="bottom-nav">
      <button class="nav-item active" data-route="home">
        <span class="nav-icon">🏠</span>
        <span>ホーム</span>
      </button>
      <button class="nav-item" data-route="contacts">
        <span class="nav-icon" style="position:relative;">👥<span class="nav-badge" id="badgeContacts" style="display:none;"></span></span>
        <span>コンタクト</span>
      </button>
      <button class="nav-item" data-route="cases">
        <span class="nav-icon" style="position:relative;">📋<span class="nav-badge" id="badgeCases" style="display:none;"></span></span>
        <span>案件</span>
      </button>
      <button class="nav-item" data-route="analytics">
        <span class="nav-icon">📊</span>
        <span>分析</span>
      </button>
      <button class="nav-item" data-route="settings">
        <span class="nav-icon">⚙️</span>
        <span>設定</span>
      </button>
    </nav>
  `;

  document.querySelectorAll('.nav-item').forEach(btn => {
    btn.addEventListener('click', () => navigate(btn.dataset.route));
  });

  document.getElementById('headerSettings')?.addEventListener('click', () => navigate('settings'));
}

// シェルが既にあるか確認、なければ作る
function ensureShell(activeTab) {
  if (!document.getElementById('mainContent')) {
    renderShell();
  }
  // アクティブタブ更新
  document.querySelectorAll('.nav-item').forEach(el => {
    el.classList.toggle('active', el.dataset.route === activeTab);
  });
}

// --- ホーム画面 ---
async function renderHome() {
  ensureShell('home');
  const content = getContentEl();
  showLoading(content, 'データを読み込み中...');

  try {
    const [statusCounts, contactStats, recentCases] = await Promise.all([
      getCaseStatusCounts(),
      getContactStats(),
      getCases({ limit: 5 }),
    ]);

    const staff = getCurrentStaff();
    const today = new Date();
    const dayNames = ['日', '月', '火', '水', '木', '金', '土'];
    const hour = today.getHours();
    const greeting = hour < 12 ? 'おはようございます' : hour < 18 ? 'こんにちは' : 'お疲れさまです';

    // KPI
    const totalContacts = Object.values(contactStats).reduce((a, b) => a + b, 0);
    const activeCases = CONFIG.CASE_STATUS_FLOW.reduce((sum, s) => sum + (statusCounts[s] || 0), 0);
    const referralCount = statusCounts['紹介獲得'] || 0;

    // パイプライン
    const pipelineHtml = CONFIG.CASE_STATUS_FLOW.map(status => {
      const count = statusCounts[status] || 0;
      const isHighlight = ['同行紹介', '完了確認', '紹介獲得'].includes(status);
      return `
        <div style="display:flex;flex-direction:column;align-items:center;min-width:56px;padding:8px 4px;border-radius:8px;
          background:${count > 0 ? (isHighlight ? '#B8860B18' : '#1B3A5C10') : '#f5f3ee'};">
          <div style="font-size:20px;font-weight:700;color:${count > 0 ? (isHighlight ? '#B8860B' : '#1B3A5C') : '#8a8a8a'};">${count}</div>
          <div style="font-size:9px;color:${count > 0 ? '#1B3A5C' : '#8a8a8a'};text-align:center;line-height:1.2;">${status}</div>
        </div>
      `;
    }).join('');

    // 最新案件
    let casesHtml;
    if (recentCases.length > 0) {
      casesHtml = recentCases.map(c => `
        <div class="card" data-case-id="${c.id}">
          <div style="display:flex;justify-content:space-between;align-items:center;">
            <span style="font-weight:700;font-size:14px;">${escapeHtml(c.title)}</span>
            ${statusBadge(c.status)}
          </div>
          <div style="font-size:12px;color:#5a6272;margin-top:4px;">
            ${c.category ? escapeHtml(c.category) + ' · ' : ''}${formatDate(c.updated_at)}
          </div>
        </div>
      `).join('');
    } else {
      casesHtml = emptyState('📋', '案件はまだありません');
    }

    content.innerHTML = `
      <div class="fade-in">
        <div style="padding:4px 0 16px;">
          <div style="font-size:18px;font-weight:700;">${greeting}、${escapeHtml(staff.name.split(/[　 ]/)[0])}さん</div>
          <div style="color:#5a6272;font-size:12px;">${today.getMonth()+1}月${today.getDate()}日（${dayNames[today.getDay()]}）</div>
        </div>

        <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:20px;">
          <div style="background:#fff;border-radius:12px;padding:14px;text-align:center;border:1px solid #D6D3CB;box-shadow:0 1px 4px rgba(27,58,92,0.08);">
            <div style="font-size:28px;font-weight:700;color:#1B3A5C;">${totalContacts}</div>
            <div style="font-size:11px;color:#8a8a8a;">コンタクト</div>
          </div>
          <div style="background:#fff;border-radius:12px;padding:14px;text-align:center;border:1px solid #D6D3CB;box-shadow:0 1px 4px rgba(27,58,92,0.08);">
            <div style="font-size:28px;font-weight:700;color:#0D7377;">${activeCases}</div>
            <div style="font-size:11px;color:#8a8a8a;">進行中案件</div>
          </div>
          <div style="background:#fff;border-radius:12px;padding:14px;text-align:center;border:1px solid #D6D3CB;box-shadow:0 1px 4px rgba(27,58,92,0.08);">
            <div style="font-size:28px;font-weight:700;color:#B8860B;">${referralCount}</div>
            <div style="font-size:11px;color:#8a8a8a;">紹介獲得</div>
          </div>
        </div>

        <div style="font-size:13px;font-weight:700;color:#5a6272;margin-bottom:8px;">ステータス パイプライン</div>
        <div style="display:flex;gap:4px;overflow-x:auto;padding-bottom:8px;margin-bottom:16px;">${pipelineHtml}</div>

        <div style="font-size:13px;font-weight:700;color:#5a6272;margin-bottom:8px;">最新の案件</div>
        ${casesHtml}

        <div style="display:flex;gap:10px;margin-top:16px;">
          <button id="btnNewCase" style="flex:1;padding:12px;border-radius:8px;background:#1B3A5C;color:#fff;border:none;font-size:14px;font-weight:600;cursor:pointer;">＋ 新規案件</button>
          <button id="btnNewContact" style="flex:1;padding:12px;border-radius:8px;background:#0D7377;color:#fff;border:none;font-size:14px;font-weight:600;cursor:pointer;">＋ コンタクト</button>
        </div>
      </div>
    `;

    // イベント
    document.getElementById('btnNewCase')?.addEventListener('click', () => navigate('cases', { action: 'new' }));
    document.getElementById('btnNewContact')?.addEventListener('click', () => navigate('contacts', { action: 'new' }));
    content.querySelectorAll('[data-case-id]').forEach(el => {
      el.addEventListener('click', () => navigate('cases', { action: 'detail', id: el.dataset.caseId }));
    });

  } catch (err) {
    console.error('Home render error:', err);
    content.innerHTML = emptyState('⚠️', 'データの読み込みに失敗しました');
  }
}

// --- 分析画面（スタブ） ---
function renderAnalytics() {
  ensureShell('analytics');
  const content = getContentEl();
  content.innerHTML = `
    <div class="fade-in">
      ${emptyState('📊', '分析機能は今後追加予定です')}
      <div style="text-align:center;margin-top:16px;">
        <p style="font-size:13px;color:#5a6272;line-height:1.8;">
          貢献度ダッシュボード<br>
          紹介チェーン表示<br>
          担当者評価<br>
          KPIダッシュボード
        </p>
      </div>
    </div>
  `;
}

// --- 設定画面（スタブ） ---
function renderSettings() {
  ensureShell('settings');
  const content = getContentEl();
  const staff = getCurrentStaff();

  content.innerHTML = `
    <div class="fade-in">
      <div style="font-size:15px;font-weight:700;color:#1B3A5C;margin-bottom:16px;">設定</div>

      <div style="background:#fff;border-radius:12px;padding:16px;border:1px solid #D6D3CB;margin-bottom:16px;">
        <div style="font-size:16px;font-weight:700;margin-bottom:4px;">${escapeHtml(staff?.name || '---')}</div>
        <div style="font-size:12px;color:#5a6272;">${staff?.role === 'admin' ? '管理者' : 'スタッフ'}</div>
      </div>

      <button id="btnLogout" style="width:100%;padding:12px;border-radius:8px;background:#DC2626;color:#fff;border:none;font-size:14px;font-weight:600;cursor:pointer;">ログアウト</button>

      <div style="text-align:center;margin-top:32px;color:#8a8a8a;font-size:12px;">
        アスカラ v${CONFIG.APP_VERSION}
      </div>
    </div>
  `;

  document.getElementById('btnLogout')?.addEventListener('click', () => {
    if (confirm('ログアウトしますか？')) {
      logout();
      boot();
    }
  });
}

// --- 起動 ---
boot();
