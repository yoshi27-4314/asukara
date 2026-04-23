/**
 * アスカラ - 設定
 */
export const CONFIG = {
  APP_VERSION: '1.0.0',

  // Supabase (same project as tkb-ryutsu-v2)
  SUPABASE_URL: 'https://peportftucwuxfnmaanr.supabase.co',
  SUPABASE_KEY: 'sb_publishable_ndRcO6c962YBhShB3gP3MA_kHRmaofQ',

  // AWAI Supabase (Edge Functions for OCR)
  AWAI_URL: 'https://njdnfvlucwasrafoepmu.supabase.co',
  AWAI_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5qZG5mdmx1Y3dhc3JhZm9lcG11Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUzMTEzNjgsImV4cCI6MjA5MDg4NzM2OH0.jDjqf3nWqaQ0sMfDf-85dDQNbEhX90qLsOOhWJdDlM8',

  // GAS Webhook URL（スプレッドシート同期用）
  GAS_SYNC_URL: 'https://script.google.com/macros/s/AKfycbx9JpYWvi3p0HgA9Bb0RLgEjkgzbF6iJRuAX7Ks2VL3hwIEnpuTR0J1ydtxegGKRXjh/exec',

  // Case statuses (in order)
  CASE_STATUS: {
    RECEPTION: '受付',
    SITE_SURVEY: '現地調査',
    HEARING: 'ヒアリング',
    ASSIGNMENT: '振り分け',
    INTRODUCTION: '同行紹介',
    IN_PROGRESS: '事業部対応中',
    COMPLETION_CHECK: '完了確認',
    REFERRAL_OBTAINED: '紹介獲得',
    ON_HOLD: '保留',
    LOST: '失注',
    FOLLOW_UP: 'フォロー中',
  },

  CASE_STATUS_FLOW: [
    '受付', '現地調査', 'ヒアリング', '振り分け', '同行紹介',
    '事業部対応中', '完了確認', '紹介獲得',
  ],

  // Case categories
  CATEGORIES: [
    { id: 'movable', name: '動産（モノ）', division: 'テイクバック', example: '片付け・遺品整理・残置物撤去・買取・査定' },
    { id: 'realestate', name: '不動産（家・土地）', division: 'クリアメンテ', example: '修繕工事・解体工事・維持管理' },
    { id: 'dx', name: 'DX・AI', division: 'AIX事業部', example: '業務効率化・AI導入' },
    { id: 'legal', name: '法律・税金', division: '提携士業', example: '弁護士・行政書士・税理士・司法書士' },
    { id: 'complex', name: '複合', division: null, example: '動産＋不動産など' },
  ],

  // Divisions
  DIVISIONS: ['テイクバック', 'クリアメンテ', 'AIX事業部', '提携士業'],

  // Division roles
  DIVISION_ROLES: ['元請', '下請け', '並列'],

  // Contact types
  CONTACT_TYPES: ['取引先', '紹介者', 'エンドユーザー', '提携士業', '自社スタッフ'],

  // Relationship types
  RELATIONSHIP_TYPES: ['紹介', '同僚', '友人', '上司部下', '提携', '所属'],

  // Organization types
  ORG_TYPES: ['会社', '支店', '部署'],

  // Contract types
  CONTRACT_TYPES: ['紹介のみ', 'キャッシュバック', '下請け'],
};
