# Week 3 実行項目（詳細）

本週は「観測性」「レート制限」「RLS」「a11y/E2E 安定化」「キャッシュ/フォールバック導入」「パフォーマンス計測」「TypeScript プロジェクト参照/`tsc --build` 検討」を具体化する。

## 0) 事前準備（環境変数）

- 必須
  - `NEXT_PUBLIC_MAPBOX_TOKEN`
  - `GOOGLE_MAPS_API_KEY`
  - `OPTIMIZER_SERVICE_URL`
- 任意（有効なら Supabase を使用）
  - `SUPABASE_URL`
  - `SUPABASE_ANON_KEY` または `SUPABASE_SERVICE_ROLE_KEY`
- E2E
  - `PLAYWRIGHT_TEST_BASE_URL`（例: `http://localhost:3000`）

---

## 1) 観測性（トレーシング/相関 ID/ログ）

- 実装箇所
  - 相関 ID 生成/記録: `packages/api/src/middleware/correlation.ts`
  - tRPC への適用: `packages/api/src/router.ts`（`correlationMiddleware`）
- やること
  - [ ] Optimizer 呼び出しに相関 ID をヘッダ伝播（`x-request-id`）する設定を追加（`createOptimizerClient({ headers })` を活用）。
  - [ ] 成功/失敗/フォールバック時のログ項目を統一（`routeId`, `gap`, `executionMs`, `optimizerErrorCode` など）。
  - [ ] 主要 API 区間の所要時間が correlation ログで可視化されることを確認。
- 検証
  - [ ] 単体テスト実行: 

```bash
pnpm --filter @route-kun/api test
```

  - [ ] ローカルで `route.optimize` を叩き、コンソールに `[<correlationId>]` 付きの始終ログが流れることを確認。

---

## 2) レート制限（tRPC/ユーザー単位）

- 方針
  - tRPC ミドルウェアでユーザー単位のスライディングウィンドウ/トークンバケットを実装（例: 60 req/min）。
  - 超過時は `TRPCError({ code: 'TOO_MANY_REQUESTS' })` を返却。ログに `correlationId`, `userId`, `path` を記録。
- 実装箇所（予定）
  - `packages/api/src/router.ts` にミドルウェア追加（`correlationMiddleware` の後段）。
- 検証
  - [ ] Vitest で連続呼び出しに対する拒否を確認。
  - [ ] E2E で 429 相当の扱い/ユーザー通知を確認（UI トーストなどは任意）。

---

## 3) RLS 仕上げ（Supabase）

- 既存状況
  - `routes` / `route_stops` は RLS 有効化済み + `select/insert own` ポリシーあり。
  - `distance_cache` は service-role 専用（一般ユーザー deny）。
- やること
  - [ ] `routes` / `route_stops` に「delete own」（必要なら「update own」）ポリシーを追加。
  - [ ] `distance_cache` の読み書きが service-role キーでのみ可能であることを再確認。
  - [ ] マイグレーション適用 → 型再生成。
- コマンド例（ローカル/任意）

```bash
# Supabase 型生成（DB 反映済みが前提）
pnpm --filter @route-kun/supabase generate
```

---

## 4) a11y / E2E 安定化（apps/web）

- 実行

```bash
# 別ターミナルでアプリ起動
pnpm --filter web dev

# E2E 実行（ヘッドレス）
PLAYWRIGHT_TEST_BASE_URL=http://localhost:3000 pnpm --filter web e2e

# ヘッデッド / UI モード
pnpm --filter web e2e:headed
pnpm --filter web e2e:ui
```

- やること
  - [ ] `tests/e2e/accessibility.spec.ts` で a11y 失敗がないこと（axe）。
  - [ ] `fallback.spec.ts` でフォールバック UI の安定化（バッジ表示・配色）。
  - [ ] `optimize.spec.ts` で正常系/フォールバック系の双方を安定化。
  - [ ] flaky 対応（`--repeat-each`, 適切な `expect` の待機/role セレクタ利用）。

---

## 5) キャッシュ / フォールバック導入（距離 API + Optimizer）

- 距離キャッシュ（`@route-kun/api`）
  - 実装: `distance-cache.ts`, `distance-service.ts`, `google-distance-client.ts`
  - [ ] Google API 失敗時のリトライ/バックオフ動作確認（`OVER_QUERY_LIMIT` フィクスチャあり）。
  - [ ] Supabase を利用可能なら `SupabaseDistanceCache` 経由で実キャッシュを使用（なければ InMemory）。
  - [ ] サービス利用箇所にメトリクス反映（hits/misses）→ `route` 保存時の `distanceCacheMetrics` に引き渡し。
- Optimizer フォールバック
  - 実装: `packages/api/src/router.ts`（`nearest_neighbor` フォールバック実装済み）
  - [ ] しきい値条件/エラー時の `fallbackReason` を確認・補強。
  - [ ] UI にフォールバック理由（バッジ等）が期待通り出るか E2E で検証。
- テスト

```bash
pnpm --filter @route-kun/api test
```

---

## 6) パフォーマンス計測

- サーバー
  - [ ] `correlation` ログで `route.optimize` の所要時間を継続観測。
  - [ ] Optimizer 呼び出しのタイムアウト/リトライが期待通りか（ログ/メトリクスで確認）。
- クライアント/E2E
  - [ ] Playwright のトレースを有効化してボトルネック確認。

```bash
PLAYWRIGHT_TEST_BASE_URL=http://localhost:3000 pnpm --filter web e2e -- --trace=on
```

- ビルド
  - [ ] `turbo run build` の所要時間・キャッシュ効率を計測し、改善点（プロジェクト参照/`tsc -b`）の効果を見積もる。

---

## 7) TypeScript プロジェクト参照（`composite: true`）/ `tsc --build` 検討

- 目的
  - モノレポ全体のインクリメンタル型チェック/ビルド高速化。
- やること（最小セット）
  - [ ] `packages/api/tsconfig.json` の `"composite": true` 化。
  - [ ] ルートに `tsconfig.build.json` を追加し、各パッケージを `references` で関連付け。
  - [ ] ルート `package.json` に以下スクリプトを追加（検討段階）

```json
{
  "scripts": {
    "tsc:build": "tsc -b -v",
    "tsc:clean": "tsc -b --clean"
  }
}
```

- 検証

```bash
pnpm tsc:build || true
pnpm typecheck
```

---

## チェックリスト（完了条件）

- [ ] Optimizer への相関 ID 伝播と統一ログ項目が整備された。
- [ ] tRPC レート制限がユーザー単位で機能し、過負荷で適切に拒否される。
- [ ] `routes`/`route_stops` の RLS が更新/削除まで適切に網羅され、`distance_cache` は service-role 限定。
- [ ] a11y/E2E が安定し、フォールバック UI のケースもカバーされている。
- [ ] 距離キャッシュが（可能なら Supabase で）機能し、メトリクスが保存に反映される。
- [ ] パフォーマンス計測の導線（ログ/トレース/ビルド計測）が整った。
- [ ] `composite: true` と `tsc --build` 導入の準備（設定/スクリプト雛形）ができた。

---

## 参考メモ

- `NEXT_PUBLIC_MAPBOX_TOKEN` を設定しないと Mapbox が描画されず画面が真っ白なままになる。
- 現状の UI は決定論的なデモシナリオ（`selectDemoScenario`）で動いている。`route.optimize` / ジオコーディングが接続できたら実際の呼び出しへ置き換える。
- 入力テキストエリアに「fallback」を含めるとフォールバック UI（オレンジのバッジと地図の配色）を強制的に再現できる。
- Optimizer / ジオコーディング API が結線でき次第、apps/web のデモシナリオ（`selectDemoScenario`）を本番の `route.optimize` 呼び出しと実データに差し替える。
- E2E フローが整い次第、ステータスパネルと停留所リストの新 UI を Playwright などでテストカバーし、成功・フォールバック両方のケースを検証する。

