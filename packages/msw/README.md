# @route-kun/msw

共通の Mock Service Worker ハンドラ/fixture を集約するパッケージです。Google Maps（Geocode/Distance Matrix）と Optimizer FastAPI のワイヤー契約を 1 か所で定義し、単体/統合/E2E/Playwright から同じモックを再利用できます。

## 収録内容

- `handlers/google.ts`: Geocode/Distance Matrix の成功レスポンスと 429（レート制限）サンプル。
- `handlers/optimizer.ts`: Optimizer の成功・フォールバック・サーバーエラー・タイムアウトシナリオ。Zod ( @route-kun/optimizer-client ) でリクエスト/レスポンスをバリデーション。
- `fixtures/*`: 実サービス由来の JSON スナップショット。Playwright/E2E でシナリオを共有するための真実源です。
- `server.ts` / `worker.ts`: Vitest（Node）とブラウザ/Playwright で同一ハンドラを立ち上げるユーティリティ。
- `src/contracts/optimizer-contract.test.ts`: MSW 越しに Optimizer クライアントへ fetch し、成功/フォールバック/HTTP 5xx/タイムアウト/契約不整合を検証する contract test。

## 使い方

### Vitest / Node

```ts
import { mockServer, optimizerFallbackHandler } from '@route-kun/msw';

beforeAll(() => mockServer.listen());
afterEach(() => mockServer.resetHandlers());
afterAll(() => mockServer.close());

// テストごとにシナリオを切り替え
mockServer.use(optimizerFallbackHandler);
```

### Playwright / Browser

```ts
import { mockWorker } from '@route-kun/msw';

await mockWorker.start({ onUnhandledRequest: 'bypass' });
```

Google API キーや Optimizer サービスが未準備でも、上記のハンドラを共有するだけで end-to-end の TDD サイクルを回せます。fixture を更新する際は `packages/optimizer-client/src/fixtures/optimizer-contract.ts` を 1 ソースとして参照し、MSW/contract test が自動的にスキーマ検証する構成です。
