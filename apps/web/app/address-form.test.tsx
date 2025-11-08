import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import Page from './page';

const copy = {
  emptyInput: '住所を入力してください',
  insufficientUniqueAddresses: '2 件以上の住所を入力してください'
} as const;

describe('住所入力フォーム', () => {
  it('shows an error when the user submits empty input', async () => {
    const user = userEvent.setup();
    render(<Page />);

    const optimizeButton = screen.getByRole('button', { name: '最適化' });
    expect(optimizeButton).toBeDisabled();

    await user.click(optimizeButton);

    expect(await screen.findByText(copy.emptyInput)).toBeVisible();
  });

  it('shows an error when fewer than two unique addresses are provided', async () => {
    const user = userEvent.setup();
    render(<Page />);

    const textarea = screen.getByLabelText('住所リスト');
    const optimizeButton = screen.getByRole('button', { name: '最適化' });

    await user.type(textarea, '東京都千代田区丸の内1-1-1');
    await user.click(optimizeButton);

    expect(await screen.findByText(copy.insufficientUniqueAddresses)).toBeVisible();
    expect(optimizeButton).toBeDisabled();
  });

  it('clears errors and enables the button with two valid addresses', async () => {
    const user = userEvent.setup();
    render(<Page />);

    const textarea = screen.getByLabelText('住所リスト');
    const optimizeButton = screen.getByRole('button', { name: '最適化' });

    await user.type(
      textarea,
      ['東京都千代田区丸の内1-1-1', '大阪府大阪市北区梅田1-1-2'].join('\n')
    );

    expect(optimizeButton).toBeEnabled();
    expect(screen.queryByText(copy.emptyInput)).not.toBeInTheDocument();
    expect(screen.queryByText(copy.insufficientUniqueAddresses)).not.toBeInTheDocument();
  });
});

