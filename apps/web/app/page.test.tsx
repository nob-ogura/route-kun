import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { routeOptimizeMutationController } from '../src/test-utils/mock-trpc';

vi.mock('../src/lib/trpc', async () => await import('../src/test-utils/mock-trpc'));

import Page from './page';

afterEach(() => {
  routeOptimizeMutationController.reset();
});

describe('最適化の状態表示', () => {
  it('shows the running state while an optimization request is pending', async () => {
    const user = userEvent.setup();
    render(<Page />);

    const textarea = screen.getByLabelText('住所リスト');
    await user.type(
      textarea,
      ['東京都千代田区丸の内1-1-1', '大阪府大阪市北区梅田1-1-2'].join('\n')
    );

    const optimizeButton = screen.getByRole('button', { name: '最適化' });
    const clickPromise = user.click(optimizeButton);

    const pendingButton = await screen.findByRole('button', { name: '最適化中…' });
    expect(pendingButton).toBeDisabled();

    const statusCard = screen.getByRole('status');
    expect(within(statusCard).getByText('実行中')).toBeVisible();
    expect(within(statusCard).getByTestId('optimization-progress')).toBeVisible();

    routeOptimizeMutationController.resolveNext();
    await clickPromise;
  });
});
