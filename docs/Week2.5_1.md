### UI 層からデモダミーを排除し実 API に接続

#### 実装方針
- Testing Library + MSW で機能単位のテストを Red → Green の小サイクルで回す（外部 Optimizer/Geocode は MSW でスタブし、tRPC は本物を通す）。
- 各サイクルで「最適化実行中」「成功」「失敗」「フォールバック」「Retry」の状態遷移を1つずつ実装。
- 状態管理は React Query / tRPC mutation の状態に委譲し、ローカル state を段階的に削除。
- デモシナリオ（`selectDemoScenario`）は全サイクル完了後に削除。

### 事前調査結果
- トップページはクライアントコンポーネントで、`selectDemoScenario` を呼ぶ `runOptimization` がダミールートを返しているため、実際の HTTP 呼び出しは発生していない（apps/web/app/page.tsx:1,9,91）。
- UI は `status`, `result`, `statusError` をローカル state で直接管理し、擬似レイテンシ `wait(900)` を挟んでいる。将来的には React Query / tRPC ミューテーションの状態に委譲する想定（apps/web/app/page.tsx:91-134）。
- デモデータは `apps/web/src/demo/route-scenarios.ts` に固定され、`fallback` 文字列でフォールバック UI を強制する仕組みが残っている（apps/web/src/demo/route-scenarios.ts:6-155）。
- 既存の Vitest はバリデーション用のみで最適化の成功/失敗ケースをカバーしていないため、まず Testing Library + MSW で Red を書く余地がある（apps/web/app/address-form.test.tsx:11, docs/Week2.5.md:10）。
- ルートマップは `RouteOptimizeResult` の GeoJSON と `NEXT_PUBLIC_MAPBOX_TOKEN` を前提に描画するため、API から返る構造が現在と完全一致している必要がある（apps/web/components/route-map.tsx:25,111）。

#### 実行手順

##### 0. MSW セットアップ（全サイクル共通の準備）

`apps/web/vitest.setup.ts` で MSW サーバーを起動し、外部 HTTP（Optimizer/Geocode）をスタブする。

**セットアップ内容**:
- `@route-kun/msw` の `mockServer` を `beforeAll` で起動
- `afterEach` でハンドラをリセット
- `afterAll` でサーバーをクローズ
- 未処理リクエストは警告表示（`onUnhandledRequest: 'warn'`）

**注記**: tRPC 自体をテストでスタブしたい場合は、tRPC 用の MSW ハンドラ（または fetch モック）を別途用意する必要があります。本手順では tRPC は実ルーターを通し、外部 HTTP のみ MSW で置換します。

**確認コマンド**:
```bash
pnpm --filter web test
```

---

##### サイクル1: 最適化実行中の状態表示 (Red → Green)

###### 1-1. Red: テストを追加

`apps/web/app/page.test.tsx` に**実行中状態のテストのみ**を追加：

**テストケース**:
- 最適化実行開始後、ボタンが「最適化中…」に変わり disabled になること
- ステータスカードに「実行中」が表示されること
- プログレスバーまたはスピナーが表示されること

**検証方法**:
- フォームに有効な住所を入力してボタンをクリック
- ボタンのテキストと disabled 属性を確認
- `screen.getByText('実行中')` などでステータス表示を確認
- loading indicator の存在を確認

**確認コマンド**:
```bash
pnpm --filter web test page.test
```

→ この時点では**テスト失敗（Red）**が正常。

###### 1-2. Green: 最小実装

以下を実装して Red を Green にする：

**実装内容**:
- tRPC の `route.optimize.useMutation()` フックを初期化
- mutation の `isPending` 状態をボタンの disabled 属性に連携
- `isPending` が true のときボタンのテキストを「最適化中…」に変更
- `isPending` に応じてプログレスバーを条件付きレンダリング
- 既存の `runOptimization` 関数内で mutation を呼び出す（この時点では空の payload でも可）

**注意点**:
- まだ実際のデータ取得は実装しなくてよい（mutation を呼ぶだけで pending 状態になる）
- 既存のローカル state（`status`, `result`, `statusError`）は残しておいてよい

###### 1-3. 確認

```bash
pnpm --filter web test page.test
pnpm typecheck
```

→ サイクル1のテストが**全て Green**になることを確認。

---

##### サイクル2: 成功時の結果描画 (Red → Green)

###### 2-1. Red: テストを追加

`apps/web/app/page.test.tsx` に**成功ケースのテストのみ**を追加：

**テストケース**:
- 最適化成功後、`RouteMap` コンポーネントが表示されること（`data-testid="map-container"` の存在確認）
- 訪問順序リストが表示されること（`screen.getByRole('list')` など）
- 合計距離と時間が表示されること

**MSW 設定**:
- デフォルトハンドラ（成功レスポンス）を使用
- tRPC 経由で実際の API ルーターを通す

**確認コマンド**:
```bash
pnpm --filter web test page.test
```

→ この時点では**テスト失敗（Red）**が正常。

###### 2-2. Green: データ取得と結果表示の実装

以下を実装して Red を Green にする：

**実装内容**:
- `runOptimization` 関数を完全実装：
  - フォームの `rawInput` を `AddressListSchema` でバリデーション
  - Server Action `convertAddressList` で住所 → 座標変換（Geocode）
  - 先頭を origin、残りを destinations として分割
  - `RouteOptimizeInputSchema` 準拠の payload を生成（最大30件制限、strategy: 'quality'）
  - mutation の `mutateAsync` を実行
- mutation の `data` を `result` として取り出し、既存の UI コンポーネント（`RouteMap`, 訪問順序リスト）に props として渡す
- 擬似レイテンシ `wait(900)` を削除

**注意点**:
- 既存のローカル state `result` を mutation.data で置き換える
- `selectDemoScenario` の呼び出しを削除
- 既存の UI コンポーネントはそのまま利用（props の型が一致しているため）

###### 2-3. 確認

```bash
pnpm --filter web test page.test
pnpm typecheck
```

→ サイクル1-2のテストが**全て Green**になることを確認。

---

##### サイクル3: 失敗時のエラー表示 (Red → Green)

###### 3-1. Red: テストを追加

`apps/web/app/page.test.tsx` に**失敗ケースのテストのみ**を追加：

**テストケース**:
- 最適化失敗時、エラーアラート（`role="alert"`）が表示されること
- エラーメッセージが表示されること
- 再実行ボタンが有効になること

**MSW 設定**:
- テスト内で `mockServer.use(optimizerTimeoutHandler)` などを使い、エラーレスポンスを返す
- または tRPC ルーター層でエラーをスローさせる

**確認コマンド**:
```bash
pnpm --filter web test page.test
```

→ この時点では**テスト失敗（Red）**が正常。

###### 3-2. Green: エラー処理の実装

以下を実装して Red を Green にする：

**実装内容**:
- mutation の `error` を取り出し、エラーメッセージを UI に表示
- エラー発生時に `role="alert"` 属性を持つ要素を条件付きレンダリング
- エラー時はボタンを「再実行」テキストに変更し、有効化
- 既存のローカル state `statusError` を mutation.error.message で置き換える

**注意点**:
- try-catch で mutation 呼び出しをラップ
- エラーは自動的に mutation.error に格納されるため、手動 setState は不要

###### 3-3. 確認

```bash
pnpm --filter web test page.test
pnpm typecheck
```

→ サイクル1-3のテストが**全て Green**になることを確認。

---

##### サイクル4: フォールバック UI 分岐 (Red → Green)

###### 4-1. Red: テストを追加

`apps/web/app/page.test.tsx` に**フォールバックケースのテストのみ**を追加：

**テストケース**:
- `diagnostics.fallbackUsed` が true のレスポンスを受け取った場合、フォールバック通知（`data-testid="fallback-notice"`）が表示されること
- 通常の成功時にはフォールバック通知が表示されないこと

**MSW 設定**:
- テスト内で `mockServer.use(optimizerTimeoutHandler)` を使い、fallbackUsed: true のレスポンスを返す

**確認コマンド**:
```bash
pnpm --filter web test page.test
```

→ この時点では**テスト失敗（Red）**が正常。

###### 4-2. Green: フォールバック判定の実装

以下を実装して Red を Green にする：

**実装内容**:
- `result?.diagnostics.fallbackUsed` を参照してフォールバック通知を条件付きレンダリング
- `fallback` キーワードによる UI 強制分岐ロジックを削除
- 実データの `diagnostics` フィールドのみを信頼する

**注意点**:
- 既存の UI コンポーネントで fallback キーワードに依存している箇所があれば削除
- ヒーロー文言「`fallback` キーワードを含めると...」を削除またはコメントアウト

###### 4-3. 確認

```bash
pnpm --filter web test page.test
pnpm typecheck
```

→ サイクル1-4のテストが**全て Green**になることを確認。

---

##### サイクル5: Retry 機能 (Red → Green)

###### 5-1. Red: テストを追加

`apps/web/app/page.test.tsx` に**Retry ケースのテストのみ**を追加：

**テストケース**:
- エラー発生後、「再実行」ボタンをクリックすると再度最適化が実行されること
- 再実行後、前回のエラーがクリアされること
- 再実行で成功した場合、正常な結果が表示されること

**検証方法**:
- MSW でエラーレスポンスを返す
- エラー表示を確認
- `mockServer.use()` で成功ハンドラに差し替え
- 「再実行」ボタンをクリック
- 成功結果が表示されることを確認

**確認コマンド**:
```bash
pnpm --filter web test page.test
```

→ この時点では**テスト失敗（Red）**が正常。

###### 5-2. Green: Retry ハンドラの実装

以下を実装して Red を Green にする：

**実装内容**:
- `handleRetry` 関数を実装：
  - mutation の `reset()` を呼び出して前回のエラーをクリア
  - `runOptimization()` を再実行
  - pending 中は Retry ボタンを disabled にする
- フォームの `handleSubmit` を mutation ベースに更新：
  - 手動 setState を削除
  - mutation の状態を UI に反映
  - エラーハンドリングは mutation.error に委譲

**注意点**:
- 既存のローカル state `status` を mutation の状態から導出する形に置き換える
- `isPending`, `error`, `data` を組み合わせて `OptimizationStatus` を導出

###### 5-3. 確認

```bash
pnpm --filter web test page.test
pnpm typecheck
```

→ サイクル1-5のテストが**全て Green**になることを確認。

---

##### サイクル6: デモシナリオ削除と最終調整 (Refactor)

###### 6-1. 影響範囲の確認

以下のコマンドで `selectDemoScenario` への依存を確認：

```bash
pnpm exec grep -r "route-scenarios" apps/web/
pnpm exec grep -r "selectDemoScenario" apps/web/
```

**削除対象**:
- `apps/web/src/demo/route-scenarios.ts`
- `selectDemoScenario` の import
- デモ専用の説明文やヒーロー文言

**影響確認が必要**:
- E2E テスト（`apps/web/tests/e2e/*.spec.ts`）が `fallback` キーワードに依存していないか

###### 6-2. 削除とクリーンアップ

以下を実施：

**削除内容**:
- `apps/web/src/demo/route-scenarios.ts` ファイルを削除
- page.tsx から `selectDemoScenario` の import と呼び出しを削除
- 全てのローカル state（`status`, `result`, `statusError`）を削除し、mutation の状態のみを使用
- デモ用の説明文やコメントを削除

**最終確認**:
- tRPC mutation のみで状態管理が完結していること
- ダミーデータへの参照が0件であること
- 実データ経路で UI が正しく動作すること

###### 6-3. 全体テストの実行

```bash
# 単体テスト（MSW 含む）
pnpm --filter web test

# 型チェック
pnpm typecheck

# Lint
pnpm lint

# E2E テスト（実サービス起動が必要）
pnpm --filter web e2e
```

**確認項目**:
- [ ] 全ての単体テストが Green
- [ ] `selectDemoScenario` への参照が 0 件
- [ ] 型エラー・Lint エラーが 0 件
- [ ] E2E テストが実データ経路で動作

---

##### 補足: 環境変数と相関ID

**環境変数**:
- `.env.local` が正しく設定されているか確認
- `NEXT_PUBLIC_MAPBOX_TOKEN` が RouteMap で参照可能か確認
- `SUPABASE_*` 未設定でも開発時は動作（保存はインメモリ）

**相関ID**:
- tRPC の `createContext` で `x-request-id` ヘッダーから `correlationId` を抽出していることを確認（`packages/api/src/middleware/correlation.ts` 参照）
- ブラウザの Network タブで tRPC リクエストにヘッダーが付与されているか確認

---

##### 補足: E2E テストの更新（必要に応じて）

`apps/web/tests/e2e/optimize.spec.ts` と `fallback.spec.ts` を以下のように更新：

**更新内容**:
- 常に4件の前提を撤廃し、結果件数を動的に検証（`toBeGreaterThan(0)` など）
- `fallback` キーワード依存を削除し、MSW で Optimizer タイムアウトを再現
- 実際の fallback レスポンスを検証
- 履歴表示の前提を Week 3 実装予定に合わせて調整（現時点では Skip 可）

---

これで Week2.5_1 の実装手順が完了します。各サイクルで Red → Green → 確認を回すことで、段階的かつ安全に実装を進められます。
