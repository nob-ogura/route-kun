# Distance Cache Design

Week 1 の成果物として距離キャッシュの詳細設計を定義し、実装前に合意する。対象は Google Distance Matrix API で取得する距離・所要時間を Supabase/PostgreSQL 上に保存し、以降の `route.optimize` フローで再利用できる仕組み。

## Goals
- Google API 呼び出し回数とレイテンシを削減し、レスポンスの p95 を 1 秒以内に抑える。
- 24 時間以内に取得した距離/時間を再利用し、ルート最適化の前提データを安定化する。
- API/DB 障害時も graceful degradation し、ユーザに明示的な失敗を返す。

## Non-Goals
- ルート全体の結果キャッシュ（訪問順序のキャッシュ）は別スコープ。
- ジオコーディングのキャッシュは今回含まない。
- キャッシュのプリウォームやバッチ更新は Week 1 では検討のみ。

## Requirements
- キー: 正規化済みの出発地/目的地座標、移動モード、時間帯バケット（例: 5 分単位）で一意。
- 値: 距離[m]、所要時間[s]、リクエストメタ情報（provider、取得時刻、TTL、パラメータハッシュ）。
- TTL: MVP は 24h、期限切れでも最新値が取得できれば即時更新。将来的に過去実績から 7〜30d を検討。
- キャッシュ I/F を `packages/api` で提供し、apps/web からは直接触れない。
- サーバのみ読み書き可能（RLS + サービスロール）。
- ヒット率、ミス率、外部 API 呼数、p95 レイテンシなどのメトリクスを収集。

## Data Model (Supabase/PostgreSQL)

| Column            | Type            | Description                                      |
|-------------------|-----------------|--------------------------------------------------|
| `key`             | text (PK)       | 正規化された入力で生成したハッシュ（例: SHA256） |
| `origin_lat`      | double precision | 6 桁固定小数の緯度                                 |
| `origin_lng`      | double precision | 6 桁固定小数の経度                                 |
| `destination_lat` | double precision |                                                 |
| `destination_lng` | double precision |                                                 |
| `mode`            | text            | `driving`, `walking`, etc.                      |
| `time_bucket`     | timestamptz     | 出発時刻を 5 分単位で丸めた値                      |
| `distance_m`      | integer         | API から得た距離（m）                             |
| `duration_s`      | integer         | API から得た所要時間（秒）                         |
| `provider`        | text            | `google_distance_matrix` を想定                  |
| `status`          | text            | `fresh`, `expired`, `error` など                  |
| `requested_at`    | timestamptz     | API 呼び出し時刻                                  |
| `expires_at`      | timestamptz     | TTL 24h で算出                                    |
| `request_fingerprint` | text        | API パラメータのハッシュ（units, trafficModel 等） |
| `metadata`        | jsonb           | レスポンス全体の抜粋、デバッグ情報               |
| `hit_count`       | integer         | サービス側で自動インクリメント                   |
| `last_hit_at`     | timestamptz     | 最新ヒット時刻                                    |
| `created_at`      | timestamptz     | レコード作成時刻                                  |
| `updated_at`      | timestamptz     | レコード更新時刻                                  |

Indexes:
- PK: `key`
- Secondary: `expires_at`（期限切れ検出）、`status`、`provider`
- Optional partial index: `status = 'expired'` でバックグラウンドジョブ用に高速取得。

RLS / Permissions:
- `anon` ロールは `SELECT/INSERT/UPDATE/DELETE` 不可。
- `service_role` のみフルアクセス。
- 将来フェッチ用のバックグラウンドワーカーには supabase function または serverless component から接続。

## Key Normalization

```
normalizePoint = (lat, lng) => {
  // 小数第 6 位まで丸め（±0.11m 精度）
  return `${lat.toFixed(6)},${lng.toFixed(6)}`;
};

bucketDepartureTime = (ts) => floor(ts, 5 minutes);

makeKey = (origin, destination, mode, departureTs, requestOptions) => {
  const payload = [
    normalizePoint(origin.lat, origin.lng),
    normalizePoint(destination.lat, destination.lng),
    mode ?? 'driving',
    bucketDepartureTime(departureTs ?? now()),
    requestOptions.trafficModel ?? 'best_guess',
    requestOptions.unitSystem ?? 'metric',
  ].join('|');
  return sha256(payload);
};
```

理由:
- 距離 API の安定性を重視し、同一地点 ±数十 cm の誤差を吸収。
- 時間帯バケットでラッシュ時間の変化を考慮しつつ API 呼数を抑制。
- モード/trafficModel/unit などのオプション差異でもキャッシュを分離。

## Cache Behavior

- Read-through: アプリから `getDistance` を呼び出す → キャッシュヒットなら即返却。
- Miss: Google Distance Matrix を呼び、結果を `putDistance` で保存 → 呼び出し結果を返す。
- Expired but present: `status='expired'` の場合でも古い値を返しつつバックグラウンド更新をスケジュールする（SLA を優先）。
- Error entries: API 失敗を `status='error'` として保存し、`retry_after` を metadata に記録。UI には明示的なエラーを返す。

## API Contract (`packages/api`)

```ts
type DistanceRequest = {
  origin: { lat: number; lng: number };
  destination: { lat: number; lng: number };
  mode?: 'driving' | 'walking' | 'bicycling' | 'transit';
  departureTime?: Date;
  options?: {
    trafficModel?: 'best_guess' | 'optimistic' | 'pessimistic';
    unitSystem?: 'metric' | 'imperial';
  };
};

type DistanceResponse = {
  distanceMeters: number;
  durationSeconds: number;
  freshness: 'fresh' | 'expired' | 'fetched';
  provider: string;
  requestedAt: string;
  expiresAt: string;
  source: 'cache' | 'api';
};

interface DistanceCache {
  getDistance(request: DistanceRequest): Promise<DistanceResponse | null>;
  putDistance(request: DistanceRequest, data: DistanceResponse): Promise<void>;
}
```

Implementation notes:
- `getDistance` では key を生成し `distance_cache` を参照。ヒット時は `hit_count++`。
- ミス時は `null` を返し、呼び出し側が API → `putDistance` を呼ぶ。
- API 呼び出し時は request/response を `metadata` に保存。個人情報は含めない。
- I/F の導入のみ（実装は Week 2 以降）。

## TTL & Refresh Strategy
- `expires_at = requested_at + 24h`
- リクエスト時に `expires_at < now()` でも値があれば stale 返却可。ユーザ体験を優先し、別途バックグラウンドで新鮮な値を取得。
- Refresh worker（将来実装）は `status='expired'` の行を FIFO で処理し、成功したら `status='fresh'` へ更新。
- TTL を延ばす基準: 7 日間ヒット回数が一定以上 && Google 値との乖離が小さい場合。

## Failure Handling
- Google API の 4xx (invalid request) は即 UI にエラーを返しキャッシュしない。
- 5xx/timeout は指数バックオフ (1s, 4s, 10s) で最大 3 回リトライ。失敗時は `status='error'` を記録し `retry_after` を metadata に保存。
- 連続失敗が 5 回を超えるキーは circuit breaker 状態にし、新規 API 呼び出しを抑制。
- Supabase 書き込み失敗時はアプリ側のインメモリ fallback cache（TTL 数分）を検討。

## Observability & Metrics
- Supabase ログ + OpenTelemetry exporter で以下を集計:
  - `distance_cache_hit_total`, `distance_cache_miss_total`
  - `distance_cache_expired_return_total`
  - `distance_api_call_total{status}`
  - `distance_api_latency_ms`（p50/p95）
  - `distance_cache_db_latency_ms`
- エラートラッキング: API 失敗時は Sentry に `key`, `status`, `providerErrorCode` を添付（座標は 3 桁までにマスク）。
- Dashboards: 週次でヒット率 80% 以上を目標。閾値割れで Slack 通知。

## Phasing
1. Week 1: 本ドキュメント承認、`DistanceCache` I/F 雛形を `packages/api` に追加。
2. Week 2: Supabase テーブル作成、`getDistance` 読み取り + 書き込み実装、`route.optimize` から利用。
3. Week 3+: 期限切れ行の自動更新ワーカー、キャッシュウォーミング、TTL チューニング、メトリクスダッシュボード整備。

## Open Questions
- 時刻バケット幅を 5 分/15 分のどちらにするか（トラフィック変動とキャッシュヒット率のトレードオフ）。
- 距離と所要時間以外（例: fare、transit details）を保存する必要があるか。
- Supabase ワーカー vs Cloud Functions どちらで再取得を行うか。

上記内容で合意できれば、Week 2 での実装に着手する。その他の懸念事項があれば追記する。	Runtime
