-- =============================================
-- アスカラ スキーマ定義
-- Supabase PostgreSQL (firsteight-group プロジェクト)
-- ask_ プレフィックスで既存 tkb_ テーブルと共存
-- =============================================

-- updated_at 自動更新トリガー関数
CREATE OR REPLACE FUNCTION ask_update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- =============================================
-- 1. 組織テーブル（会社・支店・部署）
-- =============================================
CREATE TABLE IF NOT EXISTS ask_organizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  parent_id uuid REFERENCES ask_organizations(id) ON DELETE SET NULL,
  type text DEFAULT '会社', -- 会社/支店/部署
  address text,
  phone text,
  note text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

COMMENT ON TABLE ask_organizations IS '組織（会社→支店→部署の階層構造）';

CREATE INDEX IF NOT EXISTS idx_ask_org_parent ON ask_organizations(parent_id);
CREATE INDEX IF NOT EXISTS idx_ask_org_type ON ask_organizations(type);

CREATE TRIGGER trg_ask_org_updated
  BEFORE UPDATE ON ask_organizations
  FOR EACH ROW EXECUTE FUNCTION ask_update_updated_at();

ALTER TABLE ask_organizations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ask_org_all" ON ask_organizations FOR ALL USING (true) WITH CHECK (true);

-- =============================================
-- 2. コンタクトテーブル（全ての人）
-- =============================================
CREATE TABLE IF NOT EXISTS ask_contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  name_kana text,
  phone text,
  email text,
  type text DEFAULT 'エンドユーザー', -- 取引先/紹介者/エンドユーザー/提携士業/自社スタッフ
  organization_id uuid REFERENCES ask_organizations(id) ON DELETE SET NULL,
  position text, -- 役職
  note text,
  photo_url text,
  tags text[],
  registered_by text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

COMMENT ON TABLE ask_contacts IS 'コンタクト（取引先・紹介者・エンドユーザー・士業・スタッフ全て）';

CREATE INDEX IF NOT EXISTS idx_ask_contact_type ON ask_contacts(type);
CREATE INDEX IF NOT EXISTS idx_ask_contact_org ON ask_contacts(organization_id);
CREATE INDEX IF NOT EXISTS idx_ask_contact_name ON ask_contacts(name);
CREATE INDEX IF NOT EXISTS idx_ask_contact_created ON ask_contacts(created_at);

CREATE TRIGGER trg_ask_contact_updated
  BEFORE UPDATE ON ask_contacts
  FOR EACH ROW EXECUTE FUNCTION ask_update_updated_at();

ALTER TABLE ask_contacts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ask_contact_all" ON ask_contacts FOR ALL USING (true) WITH CHECK (true);

-- =============================================
-- 3. 人間関係テーブル
-- =============================================
CREATE TABLE IF NOT EXISTS ask_relationships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  from_contact_id uuid NOT NULL REFERENCES ask_contacts(id) ON DELETE CASCADE,
  to_contact_id uuid NOT NULL REFERENCES ask_contacts(id) ON DELETE CASCADE,
  type text NOT NULL, -- 紹介/同僚/友人/上司部下/提携/所属
  note text,
  created_at timestamptz DEFAULT now()
);

COMMENT ON TABLE ask_relationships IS '人と人の関係（紹介・同僚・友人等）';

CREATE INDEX IF NOT EXISTS idx_ask_rel_from ON ask_relationships(from_contact_id);
CREATE INDEX IF NOT EXISTS idx_ask_rel_to ON ask_relationships(to_contact_id);
CREATE INDEX IF NOT EXISTS idx_ask_rel_type ON ask_relationships(type);

ALTER TABLE ask_relationships ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ask_rel_all" ON ask_relationships FOR ALL USING (true) WITH CHECK (true);

-- =============================================
-- 4. 案件テーブル
-- =============================================
CREATE TABLE IF NOT EXISTS ask_cases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  description text,
  site_address text,
  status text NOT NULL DEFAULT '受付', -- 受付/ヒアリング/振り分け/同行紹介/事業部対応中/完了確認/紹介獲得/保留/失注/フォロー中
  category text, -- 動産/不動産/DX・AI/法律・税金/複合
  contact_id uuid REFERENCES ask_contacts(id) ON DELETE SET NULL, -- 依頼者
  end_user_id uuid REFERENCES ask_contacts(id) ON DELETE SET NULL, -- エンドユーザー
  referrer_id uuid REFERENCES ask_contacts(id) ON DELETE SET NULL, -- 紹介者
  staff_id uuid REFERENCES ask_contacts(id) ON DELETE SET NULL, -- アスカラ担当者
  contract_type text, -- 紹介のみ/キャッシュバック/下請け
  revenue numeric(12,0) DEFAULT 0,
  referral_count integer DEFAULT 0,
  note text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

COMMENT ON TABLE ask_cases IS '案件（受付→ヒアリング→振り分け→同行紹介→対応中→完了確認→紹介獲得）';

CREATE INDEX IF NOT EXISTS idx_ask_case_status ON ask_cases(status);
CREATE INDEX IF NOT EXISTS idx_ask_case_category ON ask_cases(category);
CREATE INDEX IF NOT EXISTS idx_ask_case_contact ON ask_cases(contact_id);
CREATE INDEX IF NOT EXISTS idx_ask_case_referrer ON ask_cases(referrer_id);
CREATE INDEX IF NOT EXISTS idx_ask_case_staff ON ask_cases(staff_id);
CREATE INDEX IF NOT EXISTS idx_ask_case_created ON ask_cases(created_at);
CREATE INDEX IF NOT EXISTS idx_ask_case_updated ON ask_cases(updated_at);

CREATE TRIGGER trg_ask_case_updated
  BEFORE UPDATE ON ask_cases
  FOR EACH ROW EXECUTE FUNCTION ask_update_updated_at();

ALTER TABLE ask_cases ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ask_case_all" ON ask_cases FOR ALL USING (true) WITH CHECK (true);

-- =============================================
-- 5. 案件×事業部テーブル（複数振り分け対応）
-- =============================================
CREATE TABLE IF NOT EXISTS ask_case_divisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id uuid NOT NULL REFERENCES ask_cases(id) ON DELETE CASCADE,
  division text NOT NULL, -- テイクバック/クリアメンテ/AIX事業部/提携士業
  role text NOT NULL DEFAULT '並列', -- 元請/下請け/並列
  note text,
  created_at timestamptz DEFAULT now()
);

COMMENT ON TABLE ask_case_divisions IS '案件と事業部の紐付け（1案件に複数事業部可、元請/下請け/並列）';

CREATE INDEX IF NOT EXISTS idx_ask_cdiv_case ON ask_case_divisions(case_id);
CREATE INDEX IF NOT EXISTS idx_ask_cdiv_division ON ask_case_divisions(division);

ALTER TABLE ask_case_divisions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ask_cdiv_all" ON ask_case_divisions FOR ALL USING (true) WITH CHECK (true);

-- =============================================
-- 6. 案件履歴テーブル
-- =============================================
CREATE TABLE IF NOT EXISTS ask_case_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id uuid NOT NULL REFERENCES ask_cases(id) ON DELETE CASCADE,
  status text NOT NULL,
  note text,
  updated_by text,
  created_at timestamptz DEFAULT now()
);

COMMENT ON TABLE ask_case_history IS '案件のステータス変更・メモ履歴';

CREATE INDEX IF NOT EXISTS idx_ask_chist_case ON ask_case_history(case_id);
CREATE INDEX IF NOT EXISTS idx_ask_chist_created ON ask_case_history(created_at);

ALTER TABLE ask_case_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ask_chist_all" ON ask_case_history FOR ALL USING (true) WITH CHECK (true);
