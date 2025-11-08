# @route-kun/optimizer-client

Optimizer FastAPI サービスとの契約（Zod スキーマ）と HTTP クライアントを提供するパッケージです。docs/Week2.md:34-39 の ToDo を以下の形で具現化しています。

## 主な構成

- `schemas.ts` — camelCase（TypeScript 公開）と snake_case（FastAPI ワイヤー）の双方を Zod で検証。`DistanceMatrix` の正方行列チェックや options のデフォルトを定義。
- `transformers.ts` — snake_case ↔ camelCase の変換を一箇所に閉じ込め、呼び出し側は常に camelCase で完結。
- `fixtures/optimizer-contract.ts` — Optimizer との入出力サンプルを 1 ファイルで管理。MSW / contract test / API ドキュメントはこの fixture を真実源として参照します。
- `http-client.ts` — `fetch` ベースのクライアント。30s タイムアウト、指数バックオフ (1s→2s→4s)、429/5xx/タイムアウト/ネットワークをリトライ、4xx を即座にエラー分類します。

## テストとモック運用

Vitest で次の観点を自動化済みです。

1. `schemas.test.ts` — fixture による decode success / 必須フィールド欠落や行列不正時の失敗を確認。
2. `http-client.test.ts` — snake_case 送信、再試行、タイムアウト分類、decode エラーをシナリオ化。

MSW や E2E テストで Optimizer をスタブする場合は `optimizerWireRequestFixture` / `optimizerWireResponseFixture` を直接 import し、必要に応じて shallow clone で値を書き換えてください。tRPC 側の contract test もこの fixture に依存させることで「1 ソース」を維持できます。

## 使い方

```ts
import { createOptimizerClient } from '@route-kun/optimizer-client';

const optimizer = createOptimizerClient({ baseUrl: process.env.OPTIMIZER_SERVICE_URL! });
const result = await optimizer.optimize({
  origin,
  destinations,
  distanceMatrix,
  options: { strategy: 'quality' }
});
```

`createOptimizerClient` の `retryDelaysMs` や `timeoutMs` を上書きすることで、Playwright/E2E など長時間テスト時のパラメータ調整も可能です。

## テスト実行方法

ルートディレクトリで下記コマンドを実行すると、Zod 契約と HTTP クライアントの両方のテストが走ります。

```bash
pnpm --filter @route-kun/optimizer-client test
```

開発中に監視実行したい場合は `vitest watch` を同じフィルターで利用してください。
