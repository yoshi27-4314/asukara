-- =============================================
-- アスカラ 接点記録テーブル
-- 全ての人との接点を時系列で蓄積する
-- =============================================

CREATE TABLE IF NOT EXISTS ask_touchpoints (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id uuid NOT NULL REFERENCES ask_contacts(id) ON DELETE CASCADE,
  type text NOT NULL, -- 電話/訪問/メール/紹介/案件/入金/お礼/名刺交換/その他
  note text,
  case_id uuid REFERENCES ask_cases(id) ON DELETE SET NULL, -- 案件紐付け（任意）
  referred_contact_id uuid REFERENCES ask_contacts(id) ON DELETE SET NULL, -- 紹介先（紹介の場合）
  recorded_by text, -- 記録者
  created_at timestamptz DEFAULT now()
);

COMMENT ON TABLE ask_touchpoints IS '接点記録（いつ・誰と・何があったか）';

CREATE INDEX IF NOT EXISTS idx_ask_tp_contact ON ask_touchpoints(contact_id);
CREATE INDEX IF NOT EXISTS idx_ask_tp_type ON ask_touchpoints(type);
CREATE INDEX IF NOT EXISTS idx_ask_tp_case ON ask_touchpoints(case_id);
CREATE INDEX IF NOT EXISTS idx_ask_tp_created ON ask_touchpoints(created_at);

ALTER TABLE ask_touchpoints ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ask_tp_all" ON ask_touchpoints FOR ALL USING (true) WITH CHECK (true);
