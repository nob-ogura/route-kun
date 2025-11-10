### UI 層からデモダミーを排除し実 API に接続

#### 実装方針
- まず Testing Library + MSW で「最適化が成功/失敗した際の UI 状態遷移」を Red にする（`最適化中` 表示・結果描画・エラーアラートなど）。
- そのテストを Green にする形で `selectDemoScenario` を呼び出している `runOptimization` を廃止し、tRPC ミューテーション Hook（React Query or `@trpc/next`）で `route.optimize` を叩く（外部 Optimizer/Geocode は MSW でスタブし、tRPC は本物を通す）。
- 状態管理（`status`, `result`, `statusError`）はミューテーションの `status/data/error` に委譲し、実レスポンスを既存 UI コンポーネントへ流す。
- 「fallback」キーワードで UI を強制分岐させていた説明文を Storybook/デモ専用に退避し、本番 UI では実レスポンスのみ表示する。

#### 前提条件（Week2.5 タスク2-4の完了が必要）

このタスクを開始する前に、以下が完了していることが必須です：

- [ ] **タスク2: tRPC エンドポイント/クライアント構築**
  - `@trpc/react-query`, `@tanstack/react-query`, `@trpc/client` の依存追加（`apps/web/package.json`）
  - `apps/web/app/api/trpc/[trpc]/route.ts` の実装（`appRouter` のアダプト、`createContext` で `userId` と `correlationId` の注入）
  - `apps/web/src/lib/trpc.ts` のクライアント設定（`createTRPCReact<AppRouter>()`, `httpBatchLink` など）
  - `apps/web/app/layout.tsx` に `TRPCProvider` + `QueryClientProvider` を配置
- [ ] **タスク3: 住所リスト変換 Server Action の実装**
  - `apps/web/app/actions/convert-address-list.ts` などに `AddressListSchema` → `RouteStop[]` への変換ロジック
  - 先頭行 = origin、残り最大30件 = destinations への分割
  - 単体テスト（Vitest）で重複排除・31件超過エラー・空行処理を検証
- [ ] **タスク4: Google Geocode 統合**
  - Server Action 内で住所文字列 → 座標解決（Google Geocode API）
  - タイムアウト（6s）、リトライ（0.5s→1.5s）、429/該当なしのエラーハンドリング
  - MSW の Google Geocode ハンドラを使った単体テスト
  - 座標キャッシュ（Supabase or メモリ、TTL 24h）の実装
- [ ] **環境変数の整備**
  - `.env.local` に以下を設定: `GOOGLE_MAPS_API_KEY`, `OPTIMIZER_SERVICE_URL`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_MAPBOX_TOKEN`
  - `packages/config` の `EnvSchema` による検証が通ること
  - Optimizer サービス（`services/optimizer-py`）が `uvicorn optimizer_service.main:app --reload --port 8001` で起動可能なこと
  - 注記: `SUPABASE_*` は省略可能。未設定時は API のルート保存がインメモリ実装にフォールバックする（本番運用時は URL とキーの設定が必要）。

### 事前調査結果
- トップページはクライアントコンポーネントで、`selectDemoScenario` を呼ぶ `runOptimization` がダミールートを返しているため、実際の HTTP 呼び出しは発生していない（apps/web/app/page.tsx:1,9,91）。
- UI は `status`, `result`, `statusError` をローカル state で直接管理し、擬似レイテンシ `wait(900)` を挟んでいる。将来的には React Query / tRPC ミューテーションの状態に委譲する想定（apps/web/app/page.tsx:91-134）。
- デモデータは `apps/web/src/demo/route-scenarios.ts` に固定され、`fallback` 文字列でフォールバック UI を強制する仕組みが残っている（apps/web/src/demo/route-scenarios.ts:6-155）。
- 既存の Vitest はバリデーション用のみで最適化の成功/失敗ケースをカバーしていないため、まず Testing Library + MSW で Red を書く余地がある（apps/web/app/address-form.test.tsx:11, docs/Week2.5.md:10）。
- ルートマップは `RouteOptimizeResult` の GeoJSON と `NEXT_PUBLIC_MAPBOX_TOKEN` を前提に描画するため、API から返る構造が現在と完全一致している必要がある（apps/web/components/route-map.tsx:25,111）。

#### 実行手順

##### 1. Testing Library + MSW でテストを Red にする

`apps/web/app/page.test.tsx` に以下のテストケースを追加（MSW で外部 Optimizer/Geocode をスタブし、tRPC は通す）：

- **最適化実行中の状態表示**
  - ボタンが「最適化中…」になり、disabled 状態になる
  - ステータスカードに「実行中」が表示される
  - プログレスバーが表示される
- **成功時の結果描画**
  - `RouteMap` コンポーネントに GeoJSON が渡される（`data-testid="map-container"` の存在を確認）
  - 訪問順序リストが表示される（`screen.getByRole('list')` など）
  - 合計距離/時間が表示される
- **失敗時のエラー表示**
  - エラーアラート（`role="alert"`）が表示される
  - 再実行ボタンが有効になる
- **フォールバック時の UI 分岐**
  - `diagnostics.fallbackUsed` が true の場合に `data-testid="fallback-notice"` が表示される

**MSW セットアップ**: `apps/web/vitest.setup.ts` で `@route-kun/msw` の `mockServer` を起動する（Optimizer/Geocode の外部依存のみスタブ）。初期はデフォルトハンドラ（成功ケース）で十分。必要に応じて `optimizerTimeoutHandler` などへ差し替える。

```ts
// apps/web/vitest.setup.ts
import '@testing-library/jest-dom/vitest';
import { mockServer } from '@route-kun/msw';

beforeAll(() => mockServer.listen({ onUnhandledRequest: 'warn' }));
afterEach(() => mockServer.resetHandlers());
afterAll(() => mockServer.close());
```

> 注記: tRPC 自体をテストでスタブしたい場合は、tRPC 用の MSW ハンドラ（または fetch モック）を別途用意する必要があります。本手順では tRPC は実ルーターを通し、外部 HTTP のみ MSW で置換します。

##### 2. ダミー依存を削除し tRPC ミューテーションの基礎を作る

`apps/web/app/page.tsx` から以下を削除/変更：

- `selectDemoScenario` の import と呼び出しを削除
- `wait(900)` の擬似レイテンシを削除
- `runOptimization` 関数を一旦空の状態に（後続手順で実装）

これで新設したテストが要求する HTTP 経路を開通させる土台を作る。

##### 3. tRPC ミューテーションを初期化し、Geocode 連携を実装

`page.tsx` 内で以下を実装：

```typescript
// tRPC フックの初期化
const optimizeMutation = trpc.route.optimize.useMutation();

// runOptimization の再実装
const runOptimization = async () => {
  // (a) UI の rawInput から AddressListSchema を検証
  const validation = AddressListSchema.safeParse({ rawInput });
  if (!validation.success) {
    throw new Error('バリデーションエラー');
  }

  // (b) Server Action で住所 → 座標変換（Geocode）
  const convertedStops = await convertAddressList(validation.data.normalizedAddresses);
  
  // (c) 先頭 = origin、残り = destinations として分割
  const [origin, ...destinations] = convertedStops;
  
  // (d) RouteOptimizeInputSchema 準拠の payload を生成
  const payload = {
    origin,
    destinations: destinations.slice(0, 30), // 最大30件制限
    options: { strategy: 'quality' as const } // デフォルト設定
  };

  // (e) tRPC ミューテーションを実行
  return await optimizeMutation.mutateAsync(payload);
};
```

**重要**: `convertAddressList` は前提条件のタスク3-4で実装済みの Server Action を想定。住所文字列配列 → `RouteStop[]`（座標付き）への変換を担当。

##### 4. ローカル state を React Query の状態に置き換える

以下のローカル state を削除：

```typescript
// 削除
const [status, setStatus] = useState<OptimizationStatus>('idle');
const [result, setResult] = useState<RouteOptimizeResult | null>(null);
const [statusError, setStatusError] = useState<string | null>(null);
```

React Query の状態を利用：

```typescript
// 追加
const { 
  status: mutationStatus, 
  data: result, 
  error, 
  isPending,
  reset 
} = optimizeMutation;

// status の導出
const status: OptimizationStatus = isPending 
  ? 'running' 
  : error 
    ? 'error' 
    : result 
      ? 'success' 
      : 'idle';

const statusError = error?.message ?? null;
```

UI の分岐を `isPending`, `status`, `data`, `error` に揃えることで、Red で書いた状態遷移テストを Green に近づける。

##### 5. ダミーデータ依存の UI 分岐を実データに置き換える

以下の変更を実施：

- **フォールバック判定**: `fallback` キーワードではなく、`result?.diagnostics.fallbackUsed` を直接参照
- **RouteMap への props**: `result.geoJson`（ダミーシナリオではなく API レスポンス）を渡す
- **説明文の削除/退避**: 「`fallback` キーワードを含めるとフォールバック UI も再現できます」というヒーロー文言を削除（またはデモ専用ページへ移動）

```typescript
// 変更前
<RouteMap geoJson={result.geoJson} ... />

// 変更後（型安全性を保証）
{result ? (
  <RouteMap geoJson={result.geoJson} ... />
) : (
  <MapPlaceholder status={status} />
)}
```

##### 6. デモシナリオファイルの削除と影響範囲の確認

**削除対象**:
- `apps/web/src/demo/route-scenarios.ts`

**影響確認が必要なファイル**:
- E2E テスト（`apps/web/tests/e2e/*.spec.ts`）: 現在 `fallback` キーワードに依存しているため、MSW の実ハンドラを使った検証に書き換えが必要
- 他のテストやコンポーネントで `selectDemoScenario` を import していないか grep で確認

```bash
# 影響確認コマンド
pnpm exec grep -r "route-scenarios" apps/web/
pnpm exec grep -r "selectDemoScenario" apps/web/
```

##### 7. フォームの Submit ハンドラを mutation ベースに更新

`handleSubmit` と `handleRetry` を以下のように変更：

```typescript
const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
  event.preventDefault();
  
  if (!validationResult.success || isPending) {
    return;
  }

  try {
    await runOptimization();
    // mutation の状態は自動更新されるため、手動 setState は不要
  } catch (error) {
    console.error('Optimization failed:', error);
    // エラーは mutation.error として UI に反映される
  }
};

const handleRetry = async () => {
  if (!isValid || isPending) {
    return;
  }
  
  reset(); // 前回のエラーをクリア
  await runOptimization();
};
```

エラーは `mutation.error` を表示し、成功時は `mutation.data` を `RouteMap` 用 props に渡して UI とテストの期待をそろえる。

##### 8. テストを実行して Green を確認

```bash
# 単体テスト（MSW 含む）
pnpm --filter web test

# 型チェック
pnpm typecheck

# E2E テスト（MSW ワーカーまたは実サービス起動が必要）
pnpm --filter web e2e
```

以下を確認：

- [ ] Red で書いたシナリオが全て Green になる
- [ ] ダミーデータ由来の分岐が残っていない（`selectDemoScenario` への参照が 0 件）
- [ ] E2E テストが実データ経路で動作する
- [ ] Linter/型エラーが発生していない

##### 9. 環境変数と相関IDの最終確認

**環境変数**:
- `.env.local` が正しく設定されているか `loadEnv()` の実行で確認
- `NEXT_PUBLIC_MAPBOX_TOKEN` が `RouteMap` で参照可能か確認
- `SUPABASE_*` 未設定でも開発時は動作（保存はインメモリ）。本番では URL とキーの設定が必要

**相関ID**:
- tRPC の `createContext` で `x-request-id` ヘッダーから `correlationId` を抽出していることを確認（`packages/api/src/middleware/correlation.ts` 参照）
- ブラウザの Network タブで tRPC リクエストにヘッダーが付与されているか確認

##### 10. E2E テストの更新（TDD 対象外だが動作確認が必要）

`apps/web/tests/e2e/optimize.spec.ts` と `fallback.spec.ts` を以下のように更新：

- **常に4件の前提を撤廃**: 結果件数を動的に検証（`await expect(page.locator('[data-testid="stop-list"] li')).toHaveCount(...)` → `toBeGreaterThan(0)` など）
- **`fallback` キーワード依存の削除**: MSW で Optimizer タイムアウトを再現し、実際の fallback レスポンスを検証
- **履歴表示の前提更新**: Week 3 で実装予定の履歴機能を考慮した構造に（現時点では Skip 可）

これで Week2.5_1 の実装手順が完了します。
