## route-kun / Week 1 事前準備（環境・アカウント）

本リポジトリの Week 1 は、外部 API 接続を MSW モックで代替する前提で進めます。よって各種 API キーは未設定でもローカル実行可能です。以下の手順で環境を整えてください。

### 必要要件（Versions）

- Node.js LTS 20（`.nvmrc`, `.node-version` で指定）
- pnpm（Corepack で有効化）
- Python 3.11（`.python-version` で指定）

### 1) バージョン切り替え

```bash
# Node 20
nvm use || nvm install

# Python 3.11（pyenv を利用する場合）
pyenv install -s 3.11 && pyenv local 3.11
```

リポジトリには以下のバージョンヒントを同梱しています。
- `.nvmrc`: 20
- `.node-version`: 20
- `.python-version`: 3.11

### 2) pnpm の準備（Corepack）

```bash
# Corepack を有効化
corepack enable

# 推奨: 安定の 10 系を明示して有効化
corepack use pnpm@10 --activate || corepack prepare pnpm@10 --activate
```

エラーで進めない場合（例: `Cannot find matching keyid` などの署名エラー）

- Node を最新の 20.x に更新して再試行
  - `nvm install 20 && nvm use`
  - その後: `corepack enable && corepack use pnpm@10 --activate`
- Corepack のキャッシュをクリアして再試行（環境によりいずれかが存在）
  - `rm -rf ~/.cache/node/corepack`
  - `rm -rf ~/.local/share/node/corepack`
  - `rm -rf ~/Library/Caches/node/corepack`
  - その後: `corepack use pnpm@10 --activate`
- 一時回避: 既知のバージョンにピン留め
  - 例: `corepack prepare pnpm@10.20.0 --activate`（ダメなら近い 10.20.x を試す）
- 最終手段: Corepack を使わず pnpm をグローバル導入
  - `npm i -g pnpm`（確認: `pnpm -v`）

補足: Corepack はパッケージマネージャの配布物を署名検証します。pnpm 側の署名鍵が更新されると、古い Corepack/キャッシュでは検証に失敗する場合があります。上記のいずれかで解消できます。

### 3) 環境変数テンプレート

`.env.example` を `.env.local` にコピーし、必要に応じて値を設定してください（Week 1 は空のままで構いません）。

```bash
cp .env.example .env.local
```

`.env.example` に含まれる主な項目:
- `NEXT_PUBLIC_MAPBOX_TOKEN`（クライアント公開。Mapbox のドメイン制限推奨）
- `GOOGLE_MAPS_API_KEY`（サーバー専用。距離/ジオコーディング用）
- `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`（RLS 前提）
- `DATABASE_URL`（PostgreSQL 接続。Supabase から取得）
- `OPTIMIZER_SERVICE_URL`（Python/OR-Tools サービスの URL）
- `PLAYWRIGHT_TEST_BASE_URL`（E2E 用。デフォルト `http://localhost:3000`）

### 4) 最小起動確認（Quick Start）

以下で「開発サーバが起動する」「型チェック/テストが（空実装でも）成功する」ことを確認します。

1. 依存関係のインストール

```bash
pnpm install
# もしくは: pnpm run install:repo
```

2. apps/web の開発サーバ起動

```bash
# web パッケージのみ起動（推奨）
pnpm -F web dev
# ポート変更例: pnpm -F web dev -- -p 3001
```

ブラウザで `http://localhost:3000` を開き、トップが表示されれば OK です（停止は Ctrl + C）。

3. 型チェック/テスト（空実装の成功確認）

```bash
pnpm typecheck
pnpm test
```

Week 1 では各パッケージの `typecheck`/`test` はプレースホルダ実装になっており、成功（0 exit）する想定です。

### 5) 型生成パイプライン（DB 型の同期）

`generate` は DB 型（Supabase）を同期するための共通コマンドです。Turbo の依存順は `generate → typecheck → test → build → e2e` となるよう調整済みです。

```bash
# 生成（各パッケージの generate を順に実行）
pnpm generate

# Supabase CLI が無い/DB URL 未設定の場合は、安定したスタブを出力します
# 実 DB に接続できる場合は、以下で上書き生成されます（コミット推奨）
# export SUPABASE_DB_URL=postgres://...  # もしくは DATABASE_URL
# pnpm -F @route-kun/supabase generate
```

出力先:
- `packages/supabase/src/types/database.types.ts`

アプリ実行/型チェック時は、上記の型を Supabase クライアントに適用しています。

### 6) 動作確認（型生成パイプライン）

以下の手順で、本リポジトリに追加した「型生成パイプライン」が正しく動作しているかを確認できます。

1. 生成の確認（スタブ or 実 DB）

```bash
# 生成を実行
pnpm generate

# 生成結果ファイルの存在確認
ls -l packages/supabase/src/types/database.types.ts
```

実行ログに次のような出力があれば OK です。
- スタブ出力時: `[supabase:types] supabase CLI not found; writing stub.` → `Types written to .../database.types.ts`
- 実 DB 出力時: Supabase CLI の標準出力がファイルに反映されます

2. パイプライン順序の確認（generate → typecheck → test → build → e2e）

```bash
pnpm build
```

Turbo のログに `@route-kun/supabase:generate` が `build` より先に実行されることを確認してください。
（Week 1 では一部パッケージの generate が空実装のため、`WARNING no output files found for task web#generate` は無害です）

3. 型適用の確認（TypeScript 型チェック）

```bash
pnpm typecheck
```

`packages/supabase/src/client.ts` は `createClient<Database>(...)` のジェネリクスを使用しています。型生成が欠落/不整合だとここで失敗します。成功すれば型の適用が機能しています。

4. 実 DB からの型生成（オプション）

Supabase CLI と DB URL を用意できる場合、実スキーマから型を生成して差分を確認できます。

参考（公式ドキュメント）
- Supabase CLI のインストール: https://supabase.com/docs/reference/cli/installation
- PostgreSQL 接続文字列（DATABASE_URL）の取得: https://supabase.com/docs/guides/database/connecting-to-postgres#connection-strings

Supabase UI での準備（プロジェクト作成とキー取得）

- サインアップ/ログイン: https://supabase.com/ にアクセスし、アカウントを作成/ログイン。
- 新規プロジェクト作成: Dashboard 右上の「New project」から以下を設定して作成。
  - Organization: 任意（既存/新規）
  - Project name: 任意（例: route-kun-dev）
  - Database password: 強固なパスワードを設定（後で控える）
  - Region/Compute: 近いリージョン、Free で可
  - Provisioning 完了まで待機（1–2 分）
- API キーの取得（ランタイム用: Data API）: Settings → API
  - Project URL → `.env.local` の `SUPABASE_URL`
  - anon public → `.env.local` の `SUPABASE_ANON_KEY`（クライアント用）
  - service_role → `.env.local` の `SUPABASE_SERVICE_ROLE_KEY`（サーバ専用。クライアントに露出しない）
- DB 接続文字列の取得（型生成/CLI 用）: Settings → Database → Connection string
  - 「URI（直接接続）」の Postgres 文字列をコピーし、`.env.local` の `DATABASE_URL`（または `SUPABASE_DB_URL`）に設定
  - 例: `postgres://USER:PASSWORD@HOST:5432/postgres`
- 拡張機能（オプション: PostGIS）: Database → Extensions で「postgis」を Enable
  - 本リポジトリは PostGIS を前提とした設計です（必要に応じて有効化）。
- RLS/セキュリティ注意: RLS は既定で有効のままにし、クライアントでは必ず anon key を使用。service_role はサーバのみ。

pnpm ワークスペースでの CLI 導入（推奨コマンド）

```bash
# Supabase CLI を @route-kun/supabase パッケージに追加（推奨）
pnpm --filter @route-kun/supabase add -D supabase --allow-build=supabase

# インストール確認（pnpm exec 経由でパッケージスコープのバイナリを実行）
pnpm -F @route-kun/supabase exec supabase --version

# 代替: リポジトリ全体に導入したい場合
# pnpm -w add -D supabase --allow-build=supabase
# 代替: 一時利用のみ
# pnpm dlx supabase@latest --help
```

備考: pnpm で CLI 導入時に一時的な `ENOENT` 警告（bin の作成失敗）が出る場合がありますが、postinstall 後にバイナリが配置されるため問題ありません。

ローカル Supabase の起動と .env 連携（推奨手順）

```bash
# 1) プロジェクト直下（packages/supabase/）に設定を初期化
pnpm -F @route-kun/supabase exec supabase init

# 2) ローカル Supabase（Docker）を起動
pnpm -F @route-kun/supabase exec supabase start

# 3) 現在の接続情報を .env 形式で出力
pnpm -F @route-kun/supabase exec supabase status -o env
```

Docker が必要です（ポート 54321/54322 が競合していないことを確認）。

型生成をローカル DB から実行する例

```bash
pnpm -F @route-kun/supabase generate
```

便利コマンド

```bash
# 停止
pnpm -F @route-kun/supabase exec supabase stop

# DB をリセット（全データ消去）
pnpm -F @route-kun/supabase exec supabase db reset

# ステータスを .env として確認
pnpm -F @route-kun/supabase exec supabase status -o env
```

```bash
export SUPABASE_DB_URL=postgres://USER:PASSWORD@HOST:PORT/DBNAME  # または DATABASE_URL を使用
pnpm -F @route-kun/supabase generate

# 差分の確認（変更があればコミット推奨）
git --no-pager diff -- packages/supabase/src/types/database.types.ts
```

5. スタブへのフォールバック確認（オプション）

DB URL を未設定、または Supabase CLI 未導入の状態で再度 `pnpm -F @route-kun/supabase generate` を実行し、スタブログが表示されることを確認します。

---

トラブルシュート
- Supabase CLI が無い/DB URL 未設定 → スタブ出力が正です。実 DB 型が必要なときのみ CLI と URL を設定してください。
- Turbo のログで generate が先に走らない → ルート `turbo.json` の `dependsOn` を確認してください（本リポジトリは調整済み）。
- 生成物をコミットすべきか → Week 1 では再現性確保のためコミット推奨です。

### 7) Week 2 事前準備: Optimizer サービススタブ

Week 2 では Python/FastAPI 製の Optimizer サービスをローカルで起動できることが前提になります。`services/optimizer-py` に最小構成のスタブを追加したので、以下の手順でセットアップしてください。

1. 依存導入と仮想環境の有効化

```bash
cd services/optimizer-py
python -m venv .venv
source .venv/bin/activate  # Windows: .venv\Scripts\activate
pip install -e .
```

2. サービス起動（デフォルトでポート 8001）

```bash
uvicorn optimizer_service.main:app --reload --port 8001
```

3. 動作確認

```bash
curl -s http://localhost:8001/health
curl -s -X POST http://localhost:8001/optimize \
  -H 'Content-Type: application/json' \
  -d '{
    "origin": {"lat": 35.681236, "lng": 139.767125},
    "destinations": [
      {"id": "tokyo-tower", "label": "Tokyo Tower", "lat": 35.6586, "lng": 139.7454},
      {"id": "shibuya", "label": "Shibuya", "lat": 35.6595, "lng": 139.7005}
    ],
    "options": {"strategy": "quality"}
  }'
```

4. `.env.local` に `OPTIMIZER_SERVICE_URL=http://localhost:8001` を追記し、Next.js/tRPC からこのスタブへ接続できるようにします。

> 備考: 現時点のスタブは最近傍法（Nearest Neighbor）でルートを計算する軽量実装です。Week 2 の tRPC/フロント実装をブロックしない目的のため、将来的に OR-Tools 実装へ差し替えることを想定しています。

### 8) Week 2: 現時点で実行できるテスト

前提: Node.js 20 / pnpm 10 で `pnpm install` 済み、`.env.local` をコピー済みであれば追加のセットアップは不要です（Python 製 Optimizer スタブを起動していなくても問題ありません）。

| 用途                       | コマンド                                   | 主な対象                                                                                                         | 備考                                                                                                         |
| -------------------------- | ------------------------------------------ | ---------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| ルート全体のスモーク       | `pnpm test`                                | Turbo が各パッケージの `generate → typecheck → test` を順番に実行                                                | 2 秒前後で完走。`packages/msw` の型チェックで `@route-kun/optimizer-client` 依存もまとめて検証されます。     |
| Next.js UI 単体            | `pnpm -F web test`                         | `apps/web/app/address-form.test.tsx`（住所フォームの UX テスト）                                                 | Vitest + Testing Library（jsdom）。開発中は `pnpm -F web test -- --watch` で常時監視できます。               |
| ドメインロジック           | `pnpm -F @route-kun/domain test`           | `packages/domain/src/address-list.test.ts`（住所正規化/重複排除）                                                | Zod スキーマで空行・全角スペース・重複チェックを網羅。ビルド不要。                                           |
| Optimizer クライアント     | `pnpm -F @route-kun/optimizer-client test` | `src/http-client.test.ts`, `src/schemas.test.ts`（リトライ/タイムアウト/スキーマ変換）                           | fetch モックを使うため、実際の Optimizer サービスは不要。                                                    |
| Optimizer MSW コントラクト | `pnpm -F @route-kun/msw test`              | `packages/msw/src/contracts/optimizer-contract.test.ts`（ハッピーパス/フォールバック/タイムアウト/5xx シナリオ） | Node 版 MSW サーバを Vitest で立ち上げ、`@route-kun/optimizer-client` のスタブ呼び出しをエミュレートします。 |

補足:
- いずれのテストも `pnpm -F <package> test -- --watch` でウォッチモードに切り替えられます。
- `web`/`msw` のテストは実ブラウザや Python サービスを使いません。外部 API を叩かないため、CI でもそのまま実行可能です。
- `pnpm -F web e2e` など E2E 用スクリプトはまだスタブ（`echo '(no e2e)'`）なので、Week 2 では上記のユニットテストを正として扱ってください。

### Week 2: 結果保存・履歴 API チェックリスト

1. Supabase のマイグレーションを適用して、新しい `routes` / `route_stops` テーブルと RLS ポリシーを確実に作成します。

   ```bash
   cd packages/supabase

   # (初回のみ) Supabase CLI にサインイン
   pnpm -F @route-kun/supabase exec supabase login

   # (初回のみ) 対象プロジェクトへリンク
   pnpm -F @route-kun/supabase exec supabase link --project-ref <YOUR_PROJECT_REF>

   # (リンク済み後) マイグレーションをプッシュ
   pnpm -F @route-kun/supabase exec supabase db push
   ```

   > `supabase link` は Supabase ダッシュボードの Project Ref（Settings → General）と Database Password（Settings → Database → Connection string）を使用します。CLI は `packages/supabase/.supabase` にリンク情報を保存しますが、個人環境専用なのでリポジトリにはコミットしないでください。リンクせずに実行したい場合は `supabase db push --db-url "$DATABASE_URL"` を使い、`DATABASE_URL`/`SUPABASE_DB_URL` にリモート DB の接続文字列を設定してください。CLI が見つからない場合は `pnpm --filter @route-kun/supabase add -D supabase --allow-build=supabase && pnpm -F @route-kun/supabase exec supabase db push`、`pnpm dlx supabase@latest db push`、または `npm i -g supabase` などで導入できます。

2. tRPC ルーターを呼び出す際は `{ userId }` を必ずコンテキストに渡してください（`route.*` プロシージャは認証済みコンテキストを必須化済み）。

   > `ctx.userId` が無いと Supabase の `routes` / `route_stops` RLS が即座に拒否するため、API は保存も履歴参照もできません。UI/テスト/スクリプトのいずれでも、`route.*` を叩く前に認証済みユーザー ID をセットしてください。
3. 依存関係をインストールしたら `pnpm --filter @route-kun/domain test` と `pnpm --filter @route-kun/api test` を実行し、結果保存・履歴 API を含むドメイン/サーバ層のテストを再確認してください。

