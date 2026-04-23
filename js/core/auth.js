/**
 * アスカラ - 認証（PIN + スタッフ選択）
 */
import { CONFIG } from './config.js';

const STORAGE_KEY = 'asukara_current_staff';

let currentStaff = null;

export function getCurrentStaff() {
  if (currentStaff) return currentStaff;
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved) {
    try { currentStaff = JSON.parse(saved); return currentStaff; } catch {}
  }
  return null;
}

export function setCurrentStaff(staff) {
  currentStaff = staff;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(staff));
}

export function logout() {
  currentStaff = null;
  localStorage.removeItem(STORAGE_KEY);
}

export function isAdmin() {
  return getCurrentStaff()?.role === 'admin';
}

// PIN認証のハッシュ（簡易版 - SHA-256）
export async function hashPin(pin) {
  const encoder = new TextEncoder();
  const data = encoder.encode(pin + '_asukara_salt');
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');
}

// ログイン画面を表示
export function showLoginScreen(container, onLogin) {
  container.innerHTML = `
    <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:100vh;background:#F5F7FA;padding:20px;">
      <div style="text-align:center;margin-bottom:40px;">
        <div style="width:72px;height:72px;background:#1B3A5C;border-radius:16px;display:flex;align-items:center;justify-content:center;margin:0 auto 12px;box-shadow:0 4px 12px rgba(27,58,92,0.2);">
          <span style="color:#E8D5B7;font-size:22px;font-weight:bold;letter-spacing:2px;">ASK</span>
        </div>
        <h1 style="color:#1B3A5C;font-size:22px;margin-bottom:4px;">アスカラ</h1>
        <p style="color:#5a6272;font-size:13px;">スタッフを選択してください</p>
      </div>
      <div id="staffGrid" style="display:grid;grid-template-columns:repeat(2,1fr);gap:12px;max-width:320px;width:100%;"></div>
    </div>
  `;

  const grid = container.querySelector('#staffGrid');
  const staffConfig = [
    { name: '浅野儀頼', role: 'admin', avatar: '👤' },
  ];

  for (const staff of staffConfig) {
    const btn = document.createElement('button');
    btn.style.cssText = 'background:#ffffff;border:1px solid #dde0e6;border-radius:12px;padding:16px 8px;text-align:center;color:#1B3A5C;cursor:pointer;transition:all 0.2s;box-shadow:0 2px 8px rgba(27,58,92,0.08);';
    btn.innerHTML = `
      <div style="font-size:28px;margin-bottom:4px;">${staff.avatar}</div>
      <div style="font-size:14px;font-weight:bold;">${staff.name}</div>
      <div style="font-size:10px;color:#5a6272;">管理者</div>
    `;
    btn.addEventListener('click', () => {
      setCurrentStaff(staff);
      onLogin(staff);
    });
    btn.addEventListener('touchstart', () => { btn.style.transform = 'scale(0.95)'; });
    btn.addEventListener('touchend', () => { btn.style.transform = ''; });
    grid.appendChild(btn);
  }
}
