# Week 2 実施手順（コード例なし）

目的: Optimizer サービス連携を軸に、最適化フロー（tRPC）と結果保存、UI/地図描画までを一気通貫で成立させる。docs/Design.md:230-235 のロードマップおよび同ドキュメントの Optimizer/データフロー記述（§3, §6-7）を実装タスクへ落とし込む。

参照: docs/Design.md:54-135, 128, 233。外部サービス要件は docs/Prompt.md を再確認。

---

## 0) ゴールと成果物（Definition of Done）

- packages/optimizer-client に Optimizer FastAPI との HTTP 契約（Zod スキーマ/型/エラーハンドリング）が確定し、型テストと契約ドキュメントが揃う。
- MSW に Google Distance Matrix/Geocode と Optimizer のモックが追加され、単体/統合/E2E で同一シナリオを再現できる。
- tRPC `route.optimize` が docs/Design.md:128 のシーケンス（検証 → 距離キャッシュ → Optimizer → DB 保存 → 応答）を実装し、成功系/フォールバック系テストが通る。
- Supabase の `routes` / `route_stops` / 距離キャッシュの保存ロジックが整備され、RLS ポリシーに沿った永続化が行える。
- apps/web に最小 UI（結果リスト、ステータス、再実行）と Mapbox 描画（ピン番号・折れ線）が表示される。
- Playwright/E2E が「住所入力 → 最適化実行 → 結果描画」のハッピーパスと Optimizer タイムアウト時の通知をカバーする。

---

## 1) 事前準備（環境・ドキュメント整備）

- Optimizer サービスのローカル起動手順（services/optimizer-py）を README に追記し、FastAPI エンドポイントのエミュレーションができる状態を確認。
- .env.local / .env.example に OPTIMIZER_SERVICE_URL、NEXT_PUBLIC_MAPBOX_TOKEN、GOOGLE_MAPS_API_KEY など Week 2 で必須となる変数を網羅し、Zod 環境スキーマを更新。
- docs/Design.md の該当セクションを読み直し、未確定の入出力項目やタイムアウト値があれば TODO を洗い出す（特に §6「コア設計ポイント」）。

### TODO（docs/Design.md 再読メモ）

- [x] Optimizer リクエスト/レスポンスの JSON フィールド名・型を正式決定する（docs/Design.md §6「最適化契約」へ表形式で反映済み）。
- [x] `options.strategy`（speed vs quality）と `fallbackTolerance` の具体的な数値範囲・デフォルトを定義する（同 §6 の `options` 表にレンジ/デフォルト/振る舞いを明記）。
- [x] Google Geocode/Distance Matrix と Optimizer の HTTP タイムアウト・リトライ方針を秒数で明示する（同 §6「外部 API タイムアウト / リトライ」で 6s/10s/30s とバックオフを確定）。

---

## 2) Optimizer クライアント契約確定（packages/optimizer-client）

1. FastAPI サービスの OpenAPI/型定義を確認し、以下を Zod スキーマで記述。
   - 入力: 出発地座標、目的地配列、距離/時間マトリクス、アルゴリズム設定（speed/quality）、フォールバック許容値。
   - 出力: 訪問順序、総距離/時間、停止順リスト、診断情報（反復回数、gap、fallback フラグ）。
2. HTTP クライアント（fetch/axios いずれか）に共通のタイムアウト（30s）、リトライ（指数バックオフ 3 回）、タイムアウト/4xx/5xx の分類エラーを実装。
3. Zod に対する型テスト（vitest）を用意し、Optimzier からの実際のレスポンス例（サービス側 fixture）で decode できること、異常レスポンスで失敗することを確認。
4. ドキュメント（docs/Design.md 追記 or packages/optimizer-client/README）に契約のフィールド説明と互換性担保方法（MSW/contract test）を記載。

---

## 3) MSW モックと契約整合テスト

- e2e/msw または共通モック層に以下のハンドラを追加。
  - Google Geocode/Distance Matrix: 正常レスポンスとレート制限エラーのサンプル。
  - Optimizer: 成功ケース、タイムアウト、fallback 発動ケース。
- モックデータは packages/optimizer-client の Zod スキーマを使ってバリデーションし、モックと実装の乖離を検出できるようにする。
- contract test: Vitest でモックレスポンスを fetch し、クライアントが期待通りの DTO を返すことを確認（MSW をテストモードで起動）。
- Playwright からも MSW を共有し、ブラウザ内の fetch が同一ダミーを参照するように設定（Service Worker or Mock Service Worker setup）。

---

## 4) tRPC `route.optimize` 実装（packages/api + apps/web）

1. 入力 Zod スキーマを Week 1 の住所検証結果と結合し、座標化済みデータを受け取れるようにする（座標未確定の場合は Server Action 側でジオコーディングしておく）。
2. 距離キャッシュ（docs/DistanceCacheDesign.md）を実装フェーズに移し、キー計算 → Supabase 読み書き → TTL 判定 → ミス時に Google 呼び出しを実行。
3. Optimizer 呼び出しフロー:
   - キャッシュ済み距離行列を整形し、packages/optimizer-client で HTTP 呼び出し。
   - 30s 超過 or 5xx 時は最近傍法フォールバック（packages/domain に実装）を発動し、UI に fallback 情報を返す。
4. 結果を Supabase に保存（`routes` ヘッダ、`route_stops` 詳細、入力ダイジェスト）し、DB トランザクション内で整合性を確保。
5. 応答には UI が必要とするフィールド（ルート ID、GeoJSON、合計距離/時間、fallback フラグ）を含める。

---

## 5) 結果保存・履歴 API の整備

- Supabase クエリモジュール（packages/supabase）に以下を追加。
  - `saveRouteResult`: routes / route_stops のバルク挿入。RLS を満たすため user_id を全レコードに付与。
  - `listRoutes`, `getRoute`: Week 3 以降に備えた参照 API も雛形を作成（スコープ外機能は TODO コメントで区切る）。
- データ完全性チェック
  - params_digest を計算して保存し、同一入力からの重複実行を後で識別できるようにする。
  - distance_cache と routes の関連メトリクス（ヒット率、保存件数）をログに残す。
- Migration/スキーマ変更が必要であれば Supabase migration ファイルを生成し、docs/DistanceCacheDesign.md と整合性を確認。

---

## 6) UI/地図描画（apps/web）

1. 結果表示パネル
   - 進行状況（待機/実行中/完了/失敗/フォールバック）をトーストかサマリカードで表示。
   - 合計距離/時間、訪問順序一覧、再実行ボタンを配置。
2. Mapbox 表示
   - 最適化結果から GeoJSON（LineString + Point features）を生成し、ピン番号とルート線を描画。
   - モバイル幅で全ピンが収まるよう初期フィット処理を追加（Design.md §6 の要件）。
   - Optimizer タイムアウトでフォールバックした場合はピン色やバッジで視覚化。
3. アクセシビリティとレスポンシブ
   - 地図とリストのレイアウトを CSS でブレークポイント制御。
   - キーボード操作で結果リストをたどれるよう focus 管理を整える。

---

## 7) テスト・観測性

- 単体テスト
  - packages/optimizer-client: 正常系/各種エラー/リトライ回数。
  - packages/domain: フォールバックアルゴリズム、GeoJSON 生成、params_digest 計算。
- 統合テスト
  - packages/api: tRPC ハンドラに MSW（または Mock fetch）を差し込み、成功/キャッシュヒット/フォールバック/Optimizer エラーの 4 ケースを網羅。
  - Supabase 側はテスト DB or dockerized instance で実データ挿入を検証。
- Playwright/E2E
  - シナリオ1: 正常最適化 → 結果保存 → 地図描画 → 履歴カード表示。
  - シナリオ2: Optimizer タイムアウト → フォールバック通知 → 再試行ボタンで成功。
  - a11y チェック: Mapbox コンテナと結果リストのラベル関連。
- ロギング/メトリクス
  - tRPC と Optimizer 呼び出しに相関 ID を付与し、失敗時の診断ログを出力。
  - FastAPI との契約テストを CI に組み込み（MSW で再現）。

---

## 8) 週間進行目安

- Day 1: Optimizer クライアント契約・Zod スキーマ・型テスト完了。
- Day 2: MSW モックと契約整合テスト、環境変数整備。
- Day 3: `route.optimize` パイプライン実装（距離キャッシュ連携まで）。
- Day 4: Optimizer 呼び出し + フォールバック + Supabase 保存を仕上げ、統合テスト通過。
- Day 5: UI/地図描画・結果パネル実装、Playwright シナリオ 1 完了。
- Day 6: フォールバック UI・Playwright シナリオ 2、観測性/ログ仕上げ。
- Day 7: バッファ（ドキュメント更新、リファクタ、Week 3 準備、CI 調整）。

---

## 9) リスクと回避策

- Optimizer サービスの仕様変更リスク → OpenAPI から自動生成した JSON Schema を契約テストに取り込み、CI で差分検知。
- 外部 API キー不足 → Week 2 でも MSW を常用し、本番キーは最終確認時のみ使用。Mapbox/Google は rate limit を避けるため throttle 設定。
- Supabase 書き込み遅延や RLS ミス → 先にポリシーを検証できる migration 用テストユーザーを作り、Playwright で新規ルート作成 → 即座に履歴参照するテストを追加。
- 地図描画のパフォーマンス/UX → 20 stop 相当のダミーデータで 60fps を維持できるか検証し、必要に応じて仮想リストや描画簡略化を検討。
