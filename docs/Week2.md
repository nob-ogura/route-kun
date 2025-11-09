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

1. FastAPI サービスの OpenAPI/型定義を精査し、入力（出発地座標、目的地配列、距離/時間マトリクス、アルゴリズム設定 speed/quality、フォールバック許容値）と出力（訪問順序、総距離/時間、停止順リスト、診断情報: 反復回数/gap/fallback フラグ）の Zod スキーマ仕様を書き起こす。TDD の土台として、想定リクエスト/レスポンス fixture を `fixtures/optimizer-contract.ts` などに先に定義しておく。
2. 1 の fixture を用いて Vitest で失敗する契約テストを先に作成する（実サービス由来 fixture で decode 成功、フィールド欠落/型不一致で decode 失敗を明示）。テストが赤のまま Zod スキーマを実装し、全ケースが緑になるまでリファインする。
3. HTTP クライアント（fetch/axios いずれか）もテストから着手し、30s タイムアウト・指数バックオフ 3 回・タイムアウト/4xx/5xx の分類エラーを期待する振る舞いとして記述。テストを満たす形でクライアント実装とリトライ制御を整備し、型安全なリクエスト/レスポンスのパイプラインを完成させる。
4. 完成した契約内容と TDD で担保した互換性の説明を docs/Design.md もしくは packages/optimizer-client/README に追記し、MSW/contract test の運用方法（どの fixture を真実源にするか等）を言語化する。

---

## 3) MSW モックと契約整合テスト

- e2e/msw または共通モック層に以下のハンドラを追加。
  - Google Geocode/Distance Matrix: 正常レスポンスとレート制限エラーのサンプル。
  - Optimizer: 成功ケース、タイムアウト、fallback 発動ケース。
- モックデータは packages/optimizer-client の Zod スキーマを使ってバリデーションし、モックと実装の乖離を検出できるようにする。
- contract test（TDD）: まず期待する成功/失敗シナリオを Vitest で赤くし、MSW テストモードでモックレスポンスを fetch → クライアントが DTO を返すまでを実装して緑化する（失敗ケースは型不整合・HTTP エラー分類を最低 1 ケースずつ入れる）。
- Playwright からも MSW を共有し、ブラウザ内の fetch が同一ダミーを参照するように設定（Service Worker or Mock Service Worker setup）。

---

## 4) tRPC `route.optimize` 実装（packages/api + apps/web）

1. 入力 Zod スキーマは Week 1 の住所検証結果と結合した fixture を先に用意し、必須/任意フィールドや座標確定済みケースがバリデーションを通ることを Vitest で赤→緑にする（座標が無い場合は Server Action 側でジオコーディング済みであることもテストで保証）。
2. 距離キャッシュ（docs/DistanceCacheDesign.md）はキー計算・TTL 判定・Supabase 読み書きの単体テストを最初に作成し、TDD でキャッシュヒット/ミス/エラーを実装。Google 呼び出しは MSW のモックで差し替え、キャッシュポリシーの挙動をテストで固定化する。
3. Optimizer 呼び出しフローは contract test と統合テストから着手し、
   - キャッシュ済み距離行列から packages/optimizer-client へ渡す DTO 整形をテストで先に定義。
   - 30s 超過 or 5xx をシミュレートするテストを追加し、最近傍法フォールバック（packages/domain）の発火条件と UI への fallback 情報返却を TDD で固める。
4. Supabase 保存は `routes` / `route_stops` / 入力ダイジェストのトランザクション完了を期待する統合テストを先に書き、RLS 準拠で一貫性を保つ実装を行う。
5. 応答スキーマは UI が要求するフィールド（ルート ID、GeoJSON、合計距離/時間、fallback フラグ）を返すことを tRPC handler のテストで検証し、ドメインロジック→API→UI までを TDD 前提で結合させる。

> 重要: `route.*` ハンドラ/テストはすべて `ctx.userId`（認証済みユーザー）を受け取り、Supabase 保存や履歴取得の直前に必ず渡すこと。これが欠けると RLS に阻まれて DB read/write が失敗し、Week 2 の結果保存フローが成立しません。

---

## 5) 結果保存・履歴 API の整備

- 実装方針
  - 「純粋ロジック」と「DB 契約」を分離したハイブリッド TDD を採用し、API 仕様や整合性チェックはユニットで確定させる。
  - RLS／マイグレーションを含む DB 振る舞いは Supabase との統合テストで TDD を回す（ユニットでは扱わない）。
- Supabase クエリモジュール（packages/supabase）に以下を追加。
  - `saveRouteResult`: routes / route_stops のバルク挿入。RLS を満たすため user_id を全レコードに付与し、呼び出し元は `ctx.userId` を必ず引き渡す。
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

---
