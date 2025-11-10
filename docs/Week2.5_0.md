## Week 2.5 実装調査ログ

### 0. ゴールと要求の再確認
- Week 2.5 の主目的は「住所リスト → Geocode → RouteStop → tRPC `route.optimize` → Optimizer → Supabase → Mapbox」の実フローを繋ぎ込み、単体/結合テストで担保すること（docs/Week2.5.md:3）。
- タスク 1〜6 では UI ダミー撤去、Next.js tRPC API/クライアント構築、住所リスト Server Action、Google Geocode & キャッシュ統合、環境/永続化整備、テスト＆観測性の更新が求められている（docs/Week2.5.md:9,15,20,26,32,37）。

### 1. UI 層の現状と実 API 接続の課題
- トップページはクライアントコンポーネントで、`selectDemoScenario` を呼ぶ `runOptimization` がダミールートを返しているため、実際の HTTP 呼び出しは発生していない（apps/web/app/page.tsx:1,9,91）。
- UI は `status`, `result`, `statusError` をローカル state で直接管理し、擬似レイテンシ `wait(900)` を挟んでいる。将来的には React Query / tRPC ミューテーションの状態に委譲する想定（apps/web/app/page.tsx:91-134）。
- デモデータは `apps/web/src/demo/route-scenarios.ts` に固定され、`fallback` 文字列でフォールバック UI を強制する仕組みが残っている（apps/web/src/demo/route-scenarios.ts:6-155）。
- 既存の Vitest はバリデーション用のみで最適化の成功/失敗ケースをカバーしていないため、まず Testing Library + MSW で Red を書く余地がある（apps/web/app/address-form.test.tsx:11, docs/Week2.5.md:10）。
- ルートマップは `RouteOptimizeResult` の GeoJSON と `NEXT_PUBLIC_MAPBOX_TOKEN` を前提に描画するため、API から返る構造が現在と完全一致している必要がある（apps/web/components/route-map.tsx:25,111）。

### 2. Next.js tRPC エンドポイント/クライアント構築に必要な情報
- `@route-kun/api` には `appRouter` が定義済みで、`route.optimize/list/get` を含む tRPC ルーターを提供している。コンテキストには `userId`（必須）と任意の `correlationId` が必要で、`authedProcedure` がこれを検証する（packages/api/src/router.ts:44-87,613-646）。
- ルーターは `loadEnv` で `OPTIMIZER_SERVICE_URL` や Supabase の資格情報を読み込み、`createRouteRepository` で Supabase に書き込みできない場合は in-memory にフォールバックする（packages/api/src/router.ts:255-323）。
- Correlation ID 生成/ログ出力のユーティリティは `middleware/correlation.ts` にあり、`getOrCreateCorrelationId` で `x-request-id` を header から拾える（packages/api/src/middleware/correlation.ts:1-44）。
- App Router 側の `apps/web/app/api/trpc/[trpc]` ディレクトリは空のため、`@trpc/server/adapters/fetch` の `fetchRequestHandler` で `appRouter` をアダプトするルートを新規作成する必要がある（ディレクトリ構成のみ）。
- Next.js クライアントから型安全に呼び出すには `@trpc/react-query` + `@tanstack/react-query` + `@trpc/client` などが未導入なので、`apps/web/package.json` に依存追加が必要（apps/web/package.json:17-39）。
- `apps/web/src/lib` は空なので、`trpc.ts` で `createTRPCReact<AppRouter>()`, `httpBatchLink` などを定義し、`app/layout.tsx` に `TRPCProvider`（内部で QueryClientProvider）を挿入する。現在のレイアウトは素の `children` を返すだけなので差し込み余地がある（apps/web/app/layout.tsx:1-14）。
- `@route-kun/api` の `RouteOptimizeInputSchema` は `origin` + `destinations(1-30)` + 任意 `options` を要求するため、UI で構築する入力構造はこの schema と整合させる（packages/api/src/router.ts:151-188）。
- ルーター実装は `RouteOptimizeResult` の GeoJSON/diagnostics を返すので、ページ側の UI 変更は最小限で済むはず（packages/api/src/router.ts:190-224,560-610）。

### 3. 住所リスト変換 Server Action 実装の前提
- `AddressListSchema` は `rawInput` を行単位に分割・正規化し、空行/全角空白を除去、重複排除後に 2 件以上かを検証する。成功時は `normalizedAddresses` を返すため、Server Action でこれを使って origin/destination を生成できる（packages/domain/src/address-list.ts:26-59）。
- `RouteStopSchema` は `id`, `label?`, `lat`, `lng` を持つため、住所 → 座標解決後に `crypto.randomUUID()` などで ID を採番する（packages/domain/src/route.ts:15-37）。
- `route.optimize` では destinations が最大 30 件なので、入力テキストは「先頭 = origin、残り 30 件まで = destinations」として制御する必要がある（packages/api/src/router.ts:151-188）。
- `apps/web/app/actions` ディレクトリは空なので、`convertAddressList` のように `AddressListSchema` を server-only 関数で再利用し、UI からは geocode 済み構造を受け取る流れを作る（ディレクトリ構成のみ）。
- Vitest で Server Action/ユーティリティを単体テストする際は、`test` 環境で `crypto.randomUUID` の stub を用意し、`normalizedAddresses` の順序保証・31 件超過エラー・重複除去を検証する（docs/Week2.5.md:21-24）。

### 4. Google Geocode + 距離キャッシュ統合の足場
- 現状 geocode 専用のユーティリティは存在せず、Google API 関連コードは距離計測用クライアント/キャッシュのみが `@route-kun/api` にある。Geocode 呼び出しは Next.js 側で新規実装が必要（packages/api/src/google-distance-client.ts:1-170, packages/api/src/distance-cache.ts:1-210）。
- `packages/msw` には Google Geocode/Distance Matrix のハンドラと fixture が用意されているため、Vitest で成功/429/タイムアウト/該当なしケースをスタブできる（packages/msw/src/handlers/google.ts:11-42, packages/msw/src/fixtures/google.ts:1-85）。
- キャッシュ要件: DistanceCache 実装は 24h TTL、key 生成やヒット率記録の仕組みを持つので、Geocode 版を作る際の TTL/キー設計の参考にできる（packages/api/src/distance-cache.ts:124-210）。
- 429/タイムアウトのリトライは `docs/Week2.5.md` に 0.5s→1.5s と記載があるので、`fetch` ラッパーで制御する。MSW の `googleRateLimitErrorFixture` で挙動をテスト可能（packages/msw/src/fixtures/google.ts:50-53）。
- 失敗時には「住所 + 行番号」を返す必要があるため、Server Action 側で `normalizedAddresses` と索引を保持しつつエラーを組み立てる。UI は `statusError` の仕組みを流用できる（apps/web/app/page.tsx:91-134）。

### 5. API/永続化・環境変数の前提
- 環境変数は `@route-kun/config` の `EnvSchema` で厳格に検証され、`NEXT_PUBLIC_MAPBOX_TOKEN`, `GOOGLE_MAPS_API_KEY`, `OPTIMIZER_SERVICE_URL` などが必須になっている。`.env.local` を `loadEnv` が読み取るため、未設定だとサーバー起動時に例外となる（packages/config/src/env.ts:6-27, .env.example:1-33）。
- Supabase の URL/キーが空だと `createRouteRepository` が in-memory にフォールバックし、履歴 API が永続化されないので `.env.local` と README に取得手順を追記する必要がある（packages/api/src/router.ts:255-275, README.md:61-122）。
- Optimizer サービスのスタブは `services/optimizer-py` にあり、`uvicorn optimizer_service.main:app --reload --port 8001` で起動できる。`OPTIMIZER_SERVICE_URL` をローカルに向け、Next.js サーバと並行起動できるよう npm script/Turbo task を検討する（services/optimizer-py/README.md:1-40, docs/Week2.5.md:34）。
- `RouteMap` や Mapbox 関連はクライアント側で `NEXT_PUBLIC_MAPBOX_TOKEN` を直接参照するため、Next.js の `next.config.mjs` で公開環境変数をマージするか、`process.env` をビルド時に注入する必要がある（apps/web/components/route-map.tsx:111, apps/web/next.config.mjs:1-7）。

### 6. テスト戦略と観測性
- Web パッケージの Vitest は `app/**/*.test.tsx`, `components/**/*.test.tsx` を jsdom で実行し、現時点では jest-dom しかセットアップされていない。MSW のサーバ/ワーカーをテスト環境に組み込む設定を `vitest.setup.ts` へ追加する余地がある（apps/web/vitest.config.ts:8-19, apps/web/vitest.setup.ts:1）。
- `@route-kun/msw` は Node/Browser 両方のモックを提供しており、Vitest から `mockServer.listen()` を呼び出すことで最適化/Google API を再現できる（packages/msw/src/server.ts:1-5, packages/msw/src/worker.ts:1-21）。
- Playwright の `optimize.spec.ts` / `fallback.spec.ts` はデモシナリオ前提（常に4件、fallback キーワード）で書かれているため、実 API 接続後は結果件数に依存しない assert と履歴表示の前提更新が必要（apps/web/tests/e2e/optimize.spec.ts:24-41, apps/web/tests/e2e/fallback.spec.ts:9-35）。
- API レイヤーの tRPC テストは既に `route.optimize` の正常/フォールバック/失敗ケースと履歴 API を網羅しているため、Web 側の実装が `route.optimize` を呼び切れているかを確認する際のリファレンスになる（packages/api/src/route.optimize.test.ts:40-117）。
- 観測性として `correlationMiddleware` が request start/end をログ出力するので、Next.js の `createContext` で `correlationId` を渡し、必要であればレスポンス header にも透過できる（packages/api/src/router.ts:51-86, packages/api/src/middleware/correlation.ts:17-44）。

### 7. 開発コマンドと実行フロー
- ルートスクリプト: `pnpm dev`（Turbo 経由で各 `dev` を並列起動）、`pnpm -F web dev`（Next.js 単体）、`pnpm typecheck`, `pnpm test`, `pnpm --filter web e2e` などが README にまとまっている（README.md:131-151, package.json:9-18）。
- Web アプリのローカルコマンドは `apps/web/package.json` の `dev/build/start/test/e2e` を参照。型チェックスクリプトは現在 `echo 'ok'` なので、TypeScript 実行前に Turbo 側で `^typecheck` が走る点に注意（apps/web/package.json:5-15）。
- Optimizer スタブは別ターミナルで `uvicorn optimizer_service.main:app --reload --port 8001` を起動し、`.env.local` で URL を共有する（services/optimizer-py/README.md:17-28）。
- Supabase CLI ベースの生成コマンドは `pnpm generate`（turbo）経由で全パッケージへ伝搬し、DB 型が `packages/supabase/src/types/database.types.ts` に出力される（README.md:155-199）。
- E2E 実行時は Playwright が `pnpm dev` を webServer として起動するため、必要であれば Optimizer/Geocode の実サービスや MSW ワーカーを別途起動しておく（apps/web/playwright.config.ts:3-41, docs/Week2.5.md:37-41）。

---

上記の情報を踏まえれば、UI のダミー排除 → tRPC 呼び出し → 住所/Geocode Server Action → Optimizer/Supabase 永続化 → テスト更新という Week 2.5 の各ステップを具体的に進めるための技術的前提が揃う。
