'use client';

import { AddressListSchema } from '@route-kun/domain';
import { FormEvent, useState } from 'react';

export default function Page() {
  const [rawInput, setRawInput] = useState('');

  const validationResult = AddressListSchema.safeParse({ rawInput });
  const isValid = validationResult.success;
  const errorMessage = !isValid
    ? validationResult.error.issues[0]?.message ?? '入力が無効です'
    : null;

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!validationResult.success) {
      return;
    }

    // 正常系の処理は後続のフローで実装する
  };

  return (
    <main style={{ padding: 24, maxWidth: 640 }}>
      <h1>route-kun</h1>
      <form onSubmit={handleSubmit} style={{ marginTop: 16 }}>
        <label htmlFor="address-list">住所リスト</label>
        <textarea
          id="address-list"
          name="addresses"
          rows={8}
          value={rawInput}
          onChange={(event) => setRawInput(event.target.value)}
          style={{ display: 'block', width: '100%', marginTop: 8 }}
        />
        {errorMessage ? (
          <p role="alert" style={{ color: '#b91c1c', marginTop: 8 }}>
            {errorMessage}
          </p>
        ) : null}
        <button type="submit" disabled={!isValid} style={{ marginTop: 16 }}>
          最適化
        </button>
      </form>
    </main>
  );
}
