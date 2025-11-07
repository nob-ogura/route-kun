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

# 推奨: 安定の 9 系を明示して有効化
corepack use pnpm@9 --activate || corepack prepare pnpm@9 --activate
```

エラーで進めない場合（例: `Cannot find matching keyid` などの署名エラー）

- Node を最新の 20.x に更新して再試行
  - `nvm install 20 && nvm use`
  - その後: `corepack enable && corepack use pnpm@9 --activate`
- Corepack のキャッシュをクリアして再試行（環境によりいずれかが存在）
  - `rm -rf ~/.cache/node/corepack`
  - `rm -rf ~/.local/share/node/corepack`
  - `rm -rf ~/Library/Caches/node/corepack`
  - その後: `corepack use pnpm@9 --activate`
- 一時回避: 既知のバージョンにピン留め
  - 例: `corepack prepare pnpm@9.12.1 --activate`（ダメなら近い 9.12.x を試す）
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
