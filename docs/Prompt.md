あなたは Staff+/Principal レベルのフルスタックアーキテクト兼 DX 重視の Tech Lead・DevOps・QA かつ TDD/XP 実践者です。TypeScript を中核に「高度・モダン・先端的な技術スタックを自在に扱える」ことを示す Web アプリケーションを、TDD（Red → Green → Refactor）を主軸に設計〜初期実装計画まで一気通貫で提示してください。最終成果はポートフォリオ（実運用可能）品質を目指します。

[目的]

- コード、設計、運用、品質保証、セキュリティ、パフォーマンス、アクセシビリティ、観測性を TDD によって体系化する。
- TypeScript をエンドツーエンドで貫通させた型安全を保証しつつ、最適化ロジックをテスト駆動で実装する。

[前提/変数：モダンなルート最適化Webアプリ (RouteKun) の要件]

- プロジェクト名: **RouteKun（ルートくん）**

- ドメイン/課題領域: **小規模ビジネス向け配送・訪問計画の効率化**。複数の目的地を巡回する際の「巡回セールスマン問題」（TSP）を解決し、ビジネスの生産性向上とコスト削減に貢献する。

- ターゲットユーザー/ペルソナ: **地域密着型の小規模配送業者**（1日に10〜30件程度の配達、PC操作には慣れているが専門的なIT知識は少ない）および **フィールドサービス・営業担当者**（アポイントの時間指定を考慮したルート計画が必要）。

- 最小実行可能価値（MVP）: ユーザーが「これがあれば、日々のルート計画が格段に楽になる」と実感できるコア機能に絞る。
    1.  **目的地入力**: テキストエリアへの住所リストのコピー＆ペースト。
    2.  **ルート最適化計算**: 入力された出発地と複数の目的地を基に、**最も効率的な巡回ルート**を計算し、その順番をリストで表示する（最適化は Python/OR-Tools の専用サービスを同期呼び出し。Node.js に公式バインディングがないため、言語境界は HTTP/JSON で越える）。
    3.  **地図上での可視化**: 計算結果のルートを地図上に線で描き、訪問順に番号付きのピンで表示する（Mapboxを使用）。
    4.  **結果の表示**: 計算されたルートの総移動距離と、想定所要時間を分かりやすく表示する。
    5.  **履歴保存**: 計算結果をSupabaseに保存し、後から参照可能にする。
    6.  **レスポンシブデザイン**: スマートフォンやタブレットからも快適に操作できる画面設計。

- 競合・差別化要素: **卓越したUI/UX**（モダンで直感的）。

- デプロイ先: **Vercel**（フロントエンド/CI/CD）と **Supabase** （データベース）を組み合わせ、スケーラビリティと開発スピードを重視する構成。最適化エンジンは **Python/OR-Tools** を別プロセス/サービス（例: FastAPI on Cloud Run/Fly.io/Render）として運用し、Next.js から同期 HTTP で呼び出す（Vercel/Node には公式バインディングがないため、ネイティブ依存はアプリ本体に直結させない）。

[技術スタック（TypeScript）]

- フロントエンド/フルスタック: Next.js 14（App Router, React 18, Server Components, Streaming, Partial Prerendering）
- API: tRPC（型安全 RPC）＋ Server Actions
- DB/ORM: Supabase/PostgreSQL（PostGIS拡張を必須とする） ＋ Supabase SDK（Drizzle ORM は複雑性を増すため採用せず、Supabase の型生成機能を活用）。
- マッピング/ルーティング: **Google Maps Platform**（ジオコーディング/距離API）+ **Mapbox GL JS**（地図描画・可視化）+ **OR-Tools（Python サービス経由）**。
- 最適化バックエンド: Python 3.11 + OR-Tools + FastAPI（HTTP/JSON）。
- バリデーション/スキーマ: Zod（API・環境変数・フォーム全般、特に住所リストの入力バリデーション、tRPC の入出力スキーマ定義に使用）。
- テスト: Vitest（単体/統合）+ Testing Library + MSW（モック）+ fast-check（Property-Based Testing）、Playwright（E2E, a11y スキャン）。
- モノレポ: pnpm + Turborepo

[TDD プロセス（全機能で遵守）]

- 要件をユーザーストーリーとして定義し、受け入れ基準（AC）を箇条書きで明文化。
- **Red**: 失敗するテストを先に書き、特に以下のロジックをテスト駆動で実装する。
    - **ドメインロジック**: 目的地リストの処理、最適化アルゴリズムの契約（入力/出力）。
    - **API/Contract**: 住所入力のエンドポイントに対する Zod スキーマ整合テスト。
    - **E2E**: 住所入力から最適化計算開始、地図上にルートが表示されるまでのフロー。
- **Green**: 最小実装でテストを通す（過剰設計禁止）。
- **Refactor**: パフォーマンス最適化とコード品質改善。

[出力フォーマット（TDD を前面に。この順でセクション化）]

1) エグゼクティブサマリ
- 製品概要、価値提案、ターゲット、MVP 目標

2) 技術選定とトレードオフ
- **DB/ORM選定理由**: Supabase/PostgreSQL + PostGIS を採用。Supabase SDK の型生成機能（`supabase gen types typescript`）を活用し、Drizzle ORM は採用しない（Supabase のリアルタイム機能・RLS・認証との統合を優先、ORM レイヤーの複雑性を回避）。PostGIS は地理空間クエリに必須。
- Next.js の RSC/Server Actions の使い分け、**最適化エンジン（Python/OR-Tools サービス）**の統合方法（HTTP/JSON or gRPC、タイムアウト/リトライ/バルク化の方針）、**地図サービス（Google Maps Platform + Mapbox）の使い分け**、**テスト基盤（Vitest/Playwright/MSW/fast-check）**の役割分担。
- Server Actions と tRPC の役割分担を明記（例: Server Actions=フォーム投稿/バリデーション/下書き保存、tRPC=最適化/履歴 API）。
- 距離行列は Google Maps Distance Matrix を利用し、Mapbox は表示・可視化専用とする方針を明記。
- OR-Tools は主に C++/Python 向けで Node.js に公式バインディングがないことを前提とし、Next.js 側からは Python サービスを通じて利用する方針を明記。
- テスト環境では Python/OR-Tools サービスの応答を MSW でモック化し、TDD サイクルを阻害しない。本番環境では実際の Python サービスを使用する。

3) システム構成・データフロー
- アーキテクチャ図（Mermaid記法）、リクエストライフサイクル（同期呼び出し）。
- Mermaid 例: ユーザー→Next.js UI→Server Actions→DB、UI→tRPC→Google Maps（距離行列）→Optimizer（Python/OR-Tools サービス）→DB→UI→Mapbox（描画）。

4) モノレポ構成（pnpm + Turborepo。RouteKun MVPで必要な最小限のパッケージを提案）。
   - 例: `apps/web`（Next.js）、`packages/api`（tRPC ルーター）、`packages/supabase`（Supabase クライアント＋型定義）、`packages/domain`（ビジネスロジック）、`packages/optimizer-client`（Python サービス HTTP クライアント）、`packages/ui`（共通 UI コンポーネント）、`services/optimizer-py`（Python/OR-Tools：FastAPI）、`e2e/`（Playwright）。

5) スキャフォールド手順（TDD 前提）
- 失敗する最初の E2E テスト（例: 住所入力フォームのバリデーションテスト）を追加 → CI で赤を確認 → 最小実装で緑化までのコマンド列。
   - 例コマンド: `pnpm i` → `pnpm -w run typecheck` → `pnpm -w run test` → `pnpm -w run e2e` → `pnpm -w --filter apps/web dev`。

6) コアコード例（すべて「失敗テスト → 実装 → リファクタ」の最小サイクルを示す）
- **目的地入力（テキスト）**に対する `Server Action` のミューテーション：Zod 検証（`vitest`）。
- **ルート最適化ロジックの契約テスト**：`tRPC` ルーターを通じて Python/OR-Tools サービス（FastAPI, HTTP/JSON）を同期呼び出す際の入出力スキーマ整合。
- **地図可視化（Mapbox）**の E2E サンプル：最適化結果が地図上に正しく番号付きピンで描画されることを検証。

7) データモデルと API 契約
- ER 図（Mermaid）、tRPC ルート一覧（例: `route.optimize`, `route.list`, `route.get`）、サンプルリクエスト/レスポンス（Zod スキーマも併記）。
- MVP の ERD は `routes` / `route_stops` を中心に、PostGIS の `geography(Point, 4326)` 型を使用して座標を格納し、空間インデックスを活用。Supabase の RLS（Row Level Security）ポリシーも設計に含める。

8) テスト戦略（TDD 詳細）
- テストピラミッドと優先度、**住所正規化**や**ルート計算結果の精度**検証における `fast-check` の活用方法。

9) CI/CD
- GitHub Actions の設定例（`typecheck`/`lint`/`test`/`e2e`/`build` パイプライン、Node.js 20 + pnpm を前提）。

10) 運用・観測性
- **最適化計算時間**を重要メトリクスとし、SLO/アラート閾値をテストに落とす方法。
- SLO 例: 20 ストップ時の p95 最適化時間 < 1.5s。

11) セキュリティ
- 入力検証、レート制限（高頻度の最適化計算リクエスト対策）。
- API キーの管理方針:
  - **Google Maps API キー**: サーバーサイドのみで使用（距離計算）。`GOOGLE_MAPS_API_KEY` として環境変数に保存（`NEXT_PUBLIC_` プレフィックスなし）。
  - **Mapbox Token**: クライアントサイドで地図描画に必要なため `NEXT_PUBLIC_MAPBOX_TOKEN` として公開可能。ただし URL 制限・スコープ制限を Mapbox 管理画面で設定。
  - **Supabase キー**: `SUPABASE_URL` と `SUPABASE_ANON_KEY` はクライアントで使用可能（Row Level Security で保護）、`SUPABASE_SERVICE_ROLE_KEY` はサーバーサイド専用。

12) パフォーマンス戦略
- ルート最適化計算の同期処理、キャッシュ/再検証の戦略（Next.js の React Cache または Supabase テーブルでの結果キャッシュ）。
- Google Distance Matrix のキャッシュ（出発地/目的地/出発時刻のハッシュをキーに Supabase テーブルに保存）、TTL 24時間を推奨。
- Python/OR-Tools サービスへのタイムアウト設定（30秒）と、タイムアウト時は最近傍法などの高速ヒューリスティックへのフォールバック。

13) README（最小実行手順）と 14) ロードマップ（2〜4週間のイテレーションプラン）。
   - README には `.env.local` の必須変数を明記：
     - `NEXT_PUBLIC_MAPBOX_TOKEN`: Mapbox 地図描画用（クライアント公開）
     - `GOOGLE_MAPS_API_KEY`: 距離計算用（サーバーサイド専用）
     - `SUPABASE_URL`: Supabase プロジェクト URL
     - `SUPABASE_ANON_KEY`: Supabase 匿名キー（RLS で保護）
     - `SUPABASE_SERVICE_ROLE_KEY`: 管理操作用（サーバーサイド専用、オプション）
     - `DATABASE_URL`: PostgreSQL 接続文字列（Supabase から取得）
     - `OPTIMIZER_SERVICE_URL`: Python/OR-Tools サービスのエンドポイント URL

[ミニマム TDD サンプル（提示必須）]
- 目的地リストのバリデーション（空のリストでエラー）の失敗テスト（`vitest`）→ 最小実装（例: `destinationList.spec.ts`）。
- マップコンポーネントがレスポンシブな振る舞い（モバイルビューでの表示確認、番号付きピンの表示）を検証する `playwright` テスト（例: `map-responsive.spec.ts`）。
