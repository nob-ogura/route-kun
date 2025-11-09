'use client';

import { FormEvent, KeyboardEvent, useMemo, useRef, useState } from 'react';

import type { RouteOptimizeResult } from '@route-kun/api';
import { AddressListSchema } from '@route-kun/domain';

import { RouteMap } from '../components/route-map';
import { selectDemoScenario } from '../src/demo/route-scenarios';

type OptimizationStatus = 'idle' | 'running' | 'success' | 'error';

const statusCopy: Record<
  OptimizationStatus,
  { label: string; description: string; tone: 'muted' | 'active' | 'success' | 'error' }
> = {
  idle: {
    label: '待機中',
    description: '住所リストを入力し、最適化ボタンでルート計算を開始してください。',
    tone: 'muted'
  },
  running: {
    label: '実行中',
    description: 'Optimizer が巡回ルートを計算しています…',
    tone: 'active'
  },
  success: {
    label: '完了',
    description: '最適化が完了しました。地図でピン番号とルート線を確認できます。',
    tone: 'success'
  },
  error: {
    label: '失敗',
    description: 'Optimizer へ接続できませんでした。少し待ってから再実行してください。',
    tone: 'error'
  }
};

const fallbackReasonCopy: Record<
  NonNullable<RouteOptimizeResult['diagnostics']['fallbackReason']>,
  string
> = {
  optimizer_error: 'Optimizer エラーにより最近傍法で算出した結果を表示しています。',
  optimizer_gap_exceeded: 'ギャップが許容値を超えたため最近傍法にフォールバックしました。',
  optimizer_fallback_signaled: 'Optimizer からフォールバック指示があったため安全な解を返しました。'
};

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const formatDistance = (meters: number) => {
  if (meters < 1000) {
    return `${meters.toLocaleString()} m`;
  }
  return `${(meters / 1000).toFixed(1)} km`;
};

const formatDuration = (seconds: number) => {
  const roundedMinutes = Math.max(1, Math.round(seconds / 60));
  if (roundedMinutes < 60) {
    return `${roundedMinutes} 分`;
  }

  const hours = Math.floor(roundedMinutes / 60);
  const minutes = roundedMinutes % 60;
  return minutes === 0 ? `${hours} 時間` : `${hours} 時間 ${minutes} 分`;
};

const formatExecutionTime = (executionMs?: number) => {
  if (!executionMs || executionMs <= 0) {
    return '—';
  }
  if (executionMs < 1000) {
    return `${executionMs} ms`;
  }
  return `${(executionMs / 1000).toFixed(1)} 秒`;
};

export default function Page() {
  const [rawInput, setRawInput] = useState('');
  const [status, setStatus] = useState<OptimizationStatus>('idle');
  const [result, setResult] = useState<RouteOptimizeResult | null>(null);
  const [selectedStopId, setSelectedStopId] = useState<string | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);

  const validationResult = AddressListSchema.safeParse({ rawInput });
  const isValid = validationResult.success;
  const validationError = !isValid
    ? validationResult.error.issues[0]?.message ?? '入力が無効です'
    : null;

  const runOptimization = async () => {
    setStatus('running');
    setStatusError(null);
    setResult(null);
    setSelectedStopId(null);

    // 擬似的な API レイテンシを挿入し、UI の状態遷移をテストできるようにする
    await wait(900);

    const scenario = selectDemoScenario(rawInput);
    setResult(scenario);
    setSelectedStopId(scenario.plan.orderedStops[0]?.id ?? null);
    setStatus('success');
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!validationResult.success || status === 'running') {
      return;
    }

    try {
      await runOptimization();
    } catch (error) {
      console.error(error);
      setStatus('error');
      setStatusError('最適化に失敗しました。時間をおいて再実行してください。');
    }
  };

  const handleRetry = async () => {
    if (!isValid || status === 'running') {
      return;
    }

    try {
      await runOptimization();
    } catch (error) {
      console.error(error);
      setStatus('error');
      setStatusError('最適化に失敗しました。時間をおいて再実行してください。');
    }
  };

  const diagnostics = result?.diagnostics.optimizer ?? null;
  const fallbackMessage = result?.diagnostics.fallbackUsed
    ? fallbackReasonCopy[result.diagnostics.fallbackReason ?? 'optimizer_error']
    : null;

  const stopList = result?.plan.orderedStops ?? [];

  const primaryMetric = result
    ? formatDistance(result.plan.totalDistanceM)
    : '—';
  const secondaryMetric = result
    ? formatDuration(result.plan.totalDurationS)
    : '—';

  return (
    <main className="page-shell">
      <header className="hero">
        <div>
          <p className="eyebrow">RouteKun Optimizer</p>
          <h1>住所リストから最短ルートを算出し、Mapbox で可視化します</h1>
          <p className="lead">
            1 行 1 件で住所を入力すると、巡回順序・合計距離/時間・GeoJSON を即座に生成します。
            「fallback」というキーワードを含めるとフォールバック UI も再現できます。
          </p>
        </div>
        <form className="address-form" onSubmit={handleSubmit}>
          <label htmlFor="address-list">住所リスト</label>
          <textarea
            id="address-list"
            name="addresses"
            rows={8}
            value={rawInput}
            onChange={(event) => setRawInput(event.target.value)}
            aria-describedby="address-hint"
            autoComplete="off"
          />
          <p id="address-hint" className="form-hint">
            例: 東京都千代田区丸の内1-9-1
            （1 行 1 件・最大 30 件）。「fallback」含む入力でフォールバック演出を確認できます。
          </p>
          {validationError ? (
            <p role="alert" className="form-error">
              {validationError}
            </p>
          ) : null}
          <button type="submit" disabled={!isValid || status === 'running'}>
            {status === 'running' ? '最適化中…' : '最適化'}
          </button>
        </form>
      </header>

      <section className="results-grid" aria-live="polite">
        <div className="panel" data-testid={result ? 'route-result' : undefined}>
          <StatusCard
            status={status}
            fallbackMessage={fallbackMessage}
            hasFallback={Boolean(result?.diagnostics.fallbackUsed)}
            statusError={statusError}
          />

          <div className="metrics-row">
            <Metric label="合計距離" value={primaryMetric} />
            <Metric label="合計時間" value={secondaryMetric} />
            <button
              type="button"
              className="ghost-button"
              onClick={handleRetry}
              disabled={!isValid || status === 'running'}
            >
              再実行
            </button>
          </div>

          <DiagnosticsRow
            diagnostics={diagnostics}
            fallbackUsed={Boolean(result?.diagnostics.fallbackUsed)}
            fallbackStrategy={result?.diagnostics.fallbackStrategy ?? null}
            optimizerErrorCode={result?.diagnostics.optimizerErrorCode ?? null}
          />

          {result ? (
            <StopList
              stops={stopList}
              selectedStopId={selectedStopId}
              onSelectStop={setSelectedStopId}
            />
          ) : (
            <EmptyState
              title={status === 'running' ? 'ルートを計算しています' : '結果待機中'}
              message={
                status === 'running'
                  ? '最適化が完了すると訪問順序が表示されます。'
                  : '住所リストを入力して「最適化」を押すと訪問順序が表示されます。'
              }
            />
          )}
        </div>

        <div className="panel map-panel">
          <div className="panel-header">
            <div>
              <p className="eyebrow">地図描画</p>
              <h2>Mapbox プレビュー</h2>
            </div>
            {result?.diagnostics.fallbackUsed ? (
              <span className="status-chip status-fallback">最近傍法</span>
            ) : (
              <span className="status-chip status-default">Optimized</span>
            )}
          </div>
          {result ? (
            <RouteMap
              geoJson={result.geoJson}
              isFallback={result.diagnostics.fallbackUsed}
              selectedStopId={selectedStopId}
              onSelectStop={setSelectedStopId}
            />
          ) : (
            <MapPlaceholder status={status} />
          )}
        </div>
      </section>
    </main>
  );
}

type StatusCardProps = {
  status: OptimizationStatus;
  hasFallback: boolean;
  fallbackMessage: string | null;
  statusError: string | null;
};

const StatusCard = ({ status, hasFallback, fallbackMessage, statusError }: StatusCardProps) => {
  const copy = statusCopy[status];
  const toneClass = `status-chip status-${copy.tone}`;

  return (
    <div className="status-card" role="status">
      <div className="status-chip-row">
        <span className={toneClass}>{copy.label}</span>
        {hasFallback ? <span className="status-chip status-fallback">フォールバック</span> : null}
      </div>
      <p className="status-description" data-testid={fallbackMessage ? 'fallback-notice' : undefined}>
        {fallbackMessage ?? copy.description}
      </p>
      {status === 'running' ? <div className="status-progress" aria-hidden="true" /> : null}
      {status === 'error' && statusError ? (
        <p role="alert" className="status-error-message">
          {statusError}
        </p>
      ) : null}
    </div>
  );
};

const Metric = ({ label, value }: { label: string; value: string }) => (
  <div className="metric">
    <span>{label}</span>
    <strong>{value}</strong>
  </div>
);

type DiagnosticsRowProps = {
  diagnostics: RouteOptimizeResult['diagnostics']['optimizer'];
  fallbackUsed: boolean;
  fallbackStrategy: RouteOptimizeResult['diagnostics']['fallbackStrategy'];
  optimizerErrorCode: RouteOptimizeResult['diagnostics']['optimizerErrorCode'];
};

const DiagnosticsRow = ({
  diagnostics,
  fallbackUsed,
  fallbackStrategy,
  optimizerErrorCode
}: DiagnosticsRowProps) => {
  const items = useMemo(
    () => [
      {
        label: '戦略',
        value: diagnostics
          ? diagnostics.strategy === 'quality'
            ? '品質優先'
            : '速度優先'
          : fallbackStrategy === 'nearest_neighbor'
            ? '最近傍法'
            : '—'
      },
      {
        label: 'ソルバー',
        value: diagnostics?.solver ?? (fallbackUsed ? 'nearest_neighbor' : '—')
      },
      {
        label: 'ギャップ',
        value: diagnostics ? `${Math.round(diagnostics.gap * 100)}%` : '—'
      },
      {
        label: '実行時間',
        value: formatExecutionTime(diagnostics?.executionMs)
      },
      {
        label: 'エラーコード',
        value: optimizerErrorCode ?? '—'
      }
    ],
    [diagnostics, fallbackStrategy, fallbackUsed, optimizerErrorCode]
  );

  return (
    <dl className="diagnostics-row">
      {items.map((item) => (
        <div key={item.label}>
          <dt>{item.label}</dt>
          <dd data-testid={item.label === 'ソルバー' && fallbackUsed ? 'algorithm-badge' : undefined}>
            {item.value}
          </dd>
        </div>
      ))}
    </dl>
  );
};

type StopListProps = {
  stops: RouteOptimizeResult['plan']['orderedStops'];
  selectedStopId: string | null;
  onSelectStop: (stopId: string) => void;
};

const StopList = ({ stops, selectedStopId, onSelectStop }: StopListProps) => {
  const buttonRefs = useRef<Array<HTMLButtonElement | null>>([]);

  const sortedStops = useMemo(
    () => [...stops].sort((a, b) => a.sequence - b.sequence),
    [stops]
  );

  const handleKeyDown = (index: number, event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') {
      return;
    }

    event.preventDefault();
    const direction = event.key === 'ArrowDown' ? 1 : -1;
    let nextIndex = index + direction;

    if (nextIndex < 0) {
      nextIndex = sortedStops.length - 1;
    } else if (nextIndex >= sortedStops.length) {
      nextIndex = 0;
    }

    const nextStop = sortedStops[nextIndex];
    const nextButton = buttonRefs.current[nextIndex];
    if (nextStop) {
      onSelectStop(nextStop.id);
      nextButton?.focus();
    }
  };

  return (
    <div className="stop-list">
      <div className="stop-list-header">
        <h2>訪問順序</h2>
        <p>↑↓キーでピンを移動できます</p>
      </div>
      <ol>
        {sortedStops.map((stop, index) => {
          const isOrigin = stop.sequence === 0;
          const label = isOrigin
            ? `出発地（${stop.label ?? stop.id}）`
            : stop.label ?? stop.id;

          return (
            <li key={stop.id}>
              <button
                ref={(element) => {
                  buttonRefs.current[index] = element;
                }}
                type="button"
                data-active={stop.id === selectedStopId}
                onClick={() => onSelectStop(stop.id)}
                onKeyDown={(event) => handleKeyDown(index, event)}
                aria-current={stop.id === selectedStopId ? 'true' : undefined}
              >
                <span className="stop-sequence">{stop.sequence}</span>
                <div>
                  <strong>{label}</strong>
                  {isOrigin ? (
                    <small>ここから最適化を開始します</small>
                  ) : (
                    <small>
                      +{formatDistance(stop.distanceFromPreviousM)} / +
                      {formatDuration(stop.durationFromPreviousS)}
                    </small>
                  )}
                </div>
                <div className="stop-meta">
                  {isOrigin ? '—' : `累計 ${formatDistance(stop.cumulativeDistanceM)}`}
                </div>
              </button>
            </li>
          );
        })}
      </ol>
    </div>
  );
};

const EmptyState = ({ title, message }: { title: string; message: string }) => (
  <div className="empty-state">
    <h2>{title}</h2>
    <p>{message}</p>
  </div>
);

const MapPlaceholder = ({ status }: { status: OptimizationStatus }) => (
  <div className="map-placeholder">
    <div>
      <h2>{status === 'running' ? '地図を準備中' : '地図プレビュー'}</h2>
      <p>
        {status === 'running'
          ? '最適化が完了するとルート線とピン番号を描画します。'
          : '最適化を実行するとこのエリアに GeoJSON を描画します。'}
      </p>
    </div>
  </div>
);
