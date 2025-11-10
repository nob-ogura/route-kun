## Week 2.5 TODO（住所リストを用いた実ルート最適化）

### ゴール
- Web UI の「住所リスト」送信内容をそのまま tRPC `route.optimize` へ連携し、Optimizer サービスが返す計算結果を Map/UI/履歴で利用できる状態を作る。
- 住所文字列 → 座標解決（Geocode）→ RouteStop 化 → 距離/最適化処理 → DB 永続化までの一連のフローを単体/結合テストで担保する（E2E は TDD 対象外）。

### タスク

#### 1. UI 層からデモダミーを排除し実 API に接続（`apps/web/app/page.tsx` ほか、TDD 推奨だが E2E は対象外）
- まず Testing Library + MSW で「最適化が成功/失敗した際の UI 状態遷移」を Red にする（`最適化中` 表示・結果描画・エラーアラートなど）。
- そのテストを Green にする形で `selectDemoScenario` を呼び出している `runOptimization` を廃止し、tRPC ミューテーション Hook（React Query or `@trpc/next`）で `route.optimize` を叩く。
- 状態管理（`status`, `result`, `statusError`）はミューテーションの `status/data/error` に委譲し、実レスポンスを既存 UI コンポーネントへ流す。
- 「fallback」キーワードで UI を強制分岐させていた説明文を Storybook/デモ専用に退避し、本番 UI では実レスポンスのみ表示する。

#### 2. Next.js で tRPC エンドポイント／クライアントを構築
- `apps/web/app/api/trpc/[trpc]/route.ts`（App Router 用）に `appRouter` をアダプトし、`createContext` で `userId`（当面はダミー、後で Supabase Auth と連携予定）と `correlationId` を注入。
- `apps/web/src/lib/trpc.ts` のようなクライアントを作り、`TRPCProvider` を `app/layout.tsx` に配置してクライアントコンポーネントから型安全に呼び出せるようにする。
- `OPTIMIZER_SERVICE_URL`, `GOOGLE_MAPS_API_KEY` など Web/FastAPI 双方が参照する env を `next.config.mjs` & `@route-kun/config` に反映し、開発手順を README に追記。

#### 3. 住所リスト変換用 Server Action（もしくは Route Handler）を実装（TDD 推奨）
- Vitest で「先頭行が出発地になる」「重複・空行が除去される」「31 件以上はエラー」などのテストフィクスチャを先に作り Red にする。
- `AddressListSchema` の `normalizedAddresses` を利用し、先頭行を出発地、以降を目的地 `RouteStop` に変換。ID は `crypto.randomUUID()`、label は元の住所文字列を用いる。
- 最大 30 件制限・重複排除は既存スキーマに従い、変換後の `RouteStop` 配列を tRPC 入力に合わせる。
- フロントは raw input ではなく、この変換済み構造をミューテーションへ渡すようにする（テキストの再パースでのズレを防止）。

#### 4. Google Geocode（+ 距離キャッシュ）の統合（TDD 推奨）
- MSW の Google Geocode ハンドラを使い、「成功レスポンス」「429 リトライ」「タイムアウト」「該当なし」など期待挙動をテスト（Red）し、ユーティリティ実装で Green にする。
- Server Action から Google Geocode API（6s タイムアウト、0.5s→1.5s リトライ）を呼び出すユーティリティを `apps/web/server` などに実装し、1 度解決した住所は Supabase かメモリにキャッシュ（TTL 24h）する。
- Geocode 失敗時は該当住所・行番号を含むメッセージを UI へ返し、ユーザーが修正できるようにする。
- 将来的な Distance Matrix 利用に備え、座標化と距離キャッシュ（`@route-kun/api` の `distance-service`）をどう組み合わせるかベースラインを決める。

#### 5. 既存 API／永続化の前提を満たす設定整備
- `.env.local` に `SUPABASE_URL/SERVICE_ROLE_KEY` を設定し、`createRouteRepository` がメモリフォールバックしないようにする。手順を README に追記。
- Optimizer サービス（Python スタブでも可）を `pnpm dev` と並行起動できるよう、Turbo task or `package.json` script を追加。
- `@route-kun/api` の依存（距離キャッシュ、optimizer-client）を web レイヤーからも再利用できるよう export ポイントを確認。

#### 6. テスト・観測性の更新（ユニット/結合は TDD、E2E は対象外）
- タスク 1〜4 を進める際に追加したテストを Watch 状態で Red→Green→Refactor させ続け、`apps/web/app/address-form.test.tsx` にも最適化ミューテーション成功/失敗ケースを先に追加してから実装。
- 実装が安定した段階で Playwright `apps/web/tests/e2e/optimize.spec.ts` を MSW の実ルート出力に合わせて更新し、「常に 4 件」の前提を撤廃して動作確認する（TDD 対象外）。
- Geocode ユーティリティ・Server Action の単体テストを追加し、Google API 呼び出しは `packages/msw` の fixture でスタブ（テスト側が真実源）。
- 新規フローのロギング/トレース（correlationId）を README or docs にまとめ、Week 3 以降の観測性改善の足がかりにする。

---

これらのタスクを完了すれば、UI 入力 → Geocode → tRPC → Optimizer → Supabase 保存 → Mapbox 描画の本番想定フローが Week 2.5 時点で接続され、Week 3 での E2E/履歴機能拡張に着手できる。
