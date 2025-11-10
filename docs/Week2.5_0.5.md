### UI 層からデモダミーを排除し実 API に接続

#### 実装方針
- まず Testing Library + MSW で「最適化が成功/失敗した際の UI 状態遷移」を Red にする（`最適化中` 表示・結果描画・エラーアラートなど）。
- そのテストを Green にする形で `selectDemoScenario` を呼び出している `runOptimization` を廃止し、tRPC ミューテーション Hook（React Query or `@trpc/next`）で `route.optimize` を叩く（外部 Optimizer/Geocode は MSW でスタブし、tRPC は本物を通す）。
- 状態管理（`status`, `result`, `statusError`）はミューテーションの `status/data/error` に委譲し、実レスポンスを既存 UI コンポーネントへ流す。
- 「fallback」キーワードで UI を強制分岐させていた説明文を Storybook/デモ専用に退避し、本番 UI では実レスポンスのみ表示する。

#### 前提条件（Week2.5 タスク1-3の完了が必要）

このタスクを開始する前に、以下が完了していることが必須です：

- [ ] **タスク1: tRPC エンドポイント/クライアント構築**
  - `@trpc/react-query`, `@tanstack/react-query`, `@trpc/client` の依存追加（`apps/web/package.json`）
  - `apps/web/app/api/trpc/[trpc]/route.ts` の実装（`appRouter` のアダプト、`createContext` で `userId` と `correlationId` の注入）
  - `apps/web/src/lib/trpc.ts` のクライアント設定（`createTRPCReact<AppRouter>()`, `httpBatchLink` など）
  - `apps/web/app/layout.tsx` に `TRPCProvider` + `QueryClientProvider` を配置
- [ ] **タスク2: 住所リスト変換 Server Action の実装**
  - `apps/web/app/actions/convert-address-list.ts` などに `AddressListSchema` → `RouteStop[]` への変換ロジック
  - 先頭行 = origin、残り最大30件 = destinations への分割
  - 単体テスト（Vitest）で重複排除・31件超過エラー・空行処理を検証
- [ ] **タスク3: Google Geocode 統合**
  - Server Action 内で住所文字列 → 座標解決（Google Geocode API）
  - タイムアウト（6s）、リトライ（0.5s→1.5s）、429/該当なしのエラーハンドリング
  - MSW の Google Geocode ハンドラを使った単体テスト
  - 座標キャッシュ（Supabase or メモリ、TTL 24h）の実装
- [ ] **環境変数の整備**
  - `.env.local` に以下を設定: `GOOGLE_MAPS_API_KEY`, `OPTIMIZER_SERVICE_URL`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_MAPBOX_TOKEN`
  - `packages/config` の `EnvSchema` による検証が通ること
  - Optimizer サービス（`services/optimizer-py`）が `uvicorn optimizer_service.main:app --reload --port 8001` で起動可能なこと
  - 注記: `SUPABASE_*` は省略可能。未設定時は API のルート保存がインメモリ実装にフォールバックする（本番運用時は URL とキーの設定が必要）。

#### TDD 実装計画（E2E 除外）

- 共通方針
  - すべて Vitest で Red→Green→Refactor を踏み、Google/Optimizer など外部依存は MSW でスタブする。E2E（Playwright）は前提条件のカバー範囲外。
  - `apps/web` 直下の Server Action/Route Handler は `vi.mock('next/headers')` で `cookies()` / `headers()` を差し替え、App Router API のテストを `Request` オブジェクト経由で行う。
  - 依存解決（例: geocode キャッシュ、tRPC クライアント）は明示的にモジュールを分割し、UT から直接 import できるよう pure 関数化する。

##### タスク1: tRPC エンドポイント/クライアント構築

- Red
  - `apps/web/app/api/trpc/[trpc]/route.test.ts`
    - `POST /api/trpc/route.list?input=...` にユーザー情報（`cookies().get('routekun.userId')` など）を渡さないと `401 UNAUTHORIZED` を返す。
    - `x-request-id` を付けると `ctx.correlationId` がその値で `appRouter` に届き、`Response` に `x-correlation-id` が反映される（`packages/api/src/middleware/correlation.ts` のロギングにスパイを仕込む）。
    - 正常系では `createAppRouter({ routeRepository: createInMemoryRouteRepository() })` で差し替えた依存によりハードコードされたレスポンスを返す。
  - `apps/web/app/layout.test.tsx`
    - `render(<TRPCProvider><TestComponent /></TRPCProvider>)` で `trpc.ping.useQuery()` が即座に `pong` を返し、`QueryClientProvider` が 1 度だけ生成されることを検証（`apps/web/src/lib/trpc.ts` の `createTRPCReact<AppRouter>()` をモック）。
- Green
  - `apps/web/package.json` に `@trpc/react-query`, `@trpc/client`, `@tanstack/react-query`, `superjson` を追加し、`pnpm install`。
  - `apps/web/app/api/trpc/[trpc]/route.ts` で `fetchRequestHandler` を利用し、`createContext` で `cookies()` からダミー `userId`、`headers()` から `x-request-id` を取得。なければ `generateCorrelationId()` で補完し `appRouter` に渡す。
  - `apps/web/src/lib/trpc.ts` に `createTRPCReact<AppRouter>()`, `httpBatchLink`, `loggerLink` を定義。`TRPCProvider` で `QueryClient` を 1 度だけ生成し、`app/layout.tsx` にラップする。
- Refactor
  - `getUserContext()`（Cookie → userId, Header → correlationId）を共通化し、Route Handler と Vitest で共有。
  - Client Provider 内の `QueryClient` 作成を `useState` に包み、テストがキャッシュリークしないようにする。
  - 後続の UI テストから再利用できる `createTestTRPCClient()` を `apps/web/src/lib/trpc.test-utils.ts` に切り出し。

##### タスク2: 住所リスト変換 Server Action

- Red
  - `apps/web/app/actions/convert-address-list.test.ts`
    - 正常系: 改行区切り 4 件を渡すと `origin.id === 'stop-0'`, `destinations.length === 3` が返る。`vi.mock('./geocode-client', ...)` で固定座標を返し、`RouteStopSchema` を使って検証。
    - 重複除去: 同じ住所を複数回書いても一度だけ geocode され、`crypto.randomUUID` をモックして連番 ID を期待。
    - 31 件超過: `normalizedAddresses` が 31 件を超えると `TRPCError({ code: 'BAD_REQUEST' })` 相当のエラーを throw。
    - 空行だけ: `AddressListSchema` の `EMPTY_INPUT_ERROR` がそのままクライアントに返る。
- Green
  - `apps/web/app/actions/convert-address-list.ts` を server-only で実装し、`AddressListSchema` → `normalizedAddresses` → `splitOriginAndDestinations` → `geocodeAddresses()` の流れを作る。
  - 1 行目を origin、残りを destinations に分割し、30 件上限をガード。`createRouteStop(label, coordinates)` のヘルパーで ID/label を組み立てる。
  - `geocodeAddresses` は Task4 で実装するため、現時点ではモックフレンドリーなインターフェースだけ定義してテストで差し替える。
- Refactor
  - `splitAddressList` や `assertDestinationLimit` を純粋関数に分け、Task4 の geocode テストからも流用。
  - `RouteStop[]` の shape を `type ConvertedAddressList = { origin: RouteStop; destinations: RouteStop[] }` として export し、後続の最適化 Server Action へ渡しやすくする。

##### タスク3: Google Geocode 統合

- Red
  - `apps/web/app/actions/geocode-client.test.ts`
    - MSW の `googleGeocodeSuccessHandler` を使って 1 件成功パスを検証 (`fetch` モックではなく実リクエスト)。
    - 429→成功: 最初のレスポンスは `googleGeocodeRateLimitHandler`、2 回目は成功ハンドラというシーケンスをセットし、0.5s → 1.5s のバックオフで 2 回だけリトライすることを `vi.useFakeTimers()` で確認。
    - ZERO_RESULTS: `distanceMatrixNotFoundFixture` を流用し、「該当なし」エラーを投げる。
    - タイムアウト: `vi.useFakeTimers()` で 6s 経過させると `AbortError` を握りつぶしてドメインエラーへ変換。
  - `apps/web/app/actions/geocode-cache.test.ts`
    - `InMemoryGeocodeCache` が 24h TTL を過ぎると再取得すること、期限内なら同じ緯度経度を返して fetch を 1 度しか呼ばないことを検証。
    - 将来 Supabase 版に差し替えられるよう `GeocodeCache` インターフェースの契約テストを用意。
  - `apps/web/app/actions/convert-address-list.integration.test.ts`
    - MSW で geocode をスタブし、Task3 の server action から実際に RouteStop[] が返り `origin.label` が元住所文字列になることを確認。
- Green
  - `apps/web/app/actions/geocode-client.ts`
    - `fetch` + `AbortController` で 6s タイムアウト、0.5s/1.5s バックオフを実装。`GOOGLE_MAPS_API_KEY` を `loadEnv` から取得し、`URLSearchParams` でエンコード。
    - レスポンスの `results[0].geometry.location` から `RouteStop` を作成し、`formatted_address` を label として採用。
    - 429/500/ネットワーク例外はカスタム `GeocodeError` にラップして server action で捕捉。
  - `apps/web/app/actions/geocode-cache.ts`
    - 初期実装はメモリ Map（key = 正規化住所、value = { coordinates, expiresAt }）。`globalThis` にぶら下げて Server Action の複数インスタンスでも共有。
    - 将来 Supabase へ切り替える際の足がかりとして `get(address)` / `set(address, coordinates)` を Promise API で定義し、TTL を `Date.now() + 24h` で管理。
  - `convert-address-list.ts` に geocode 呼び出しとキャッシュ利用を組み込み、MSW で Red にしたテストを Green。
- Refactor
  - 共通のフェッチラッパー（`withRetries(fetcher, { retries: 2, delays: [500, 1500] })`）を抽出し、Optimizer クライアントでも流用できるようにする。
  - キャッシュ key を住所文字列から `hash(normalizeAddress)` に変更して Supabase 版へ移行しやすくする。
