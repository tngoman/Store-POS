import { useRef } from 'react';

type Props = {
  value: string;
  onChange: (value: string) => void;
  due: number;
  symbol: string;
};

const SA_NOTES = [10, 20, 50, 100, 200];

function formatAmount(n: number) {
  return n.toFixed(2);
}

export default function PaymentPad({ value, onChange, due, symbol }: Props) {
  // After Exact / note pick, the next digit replaces instead of appending.
  const replaceNext = useRef(false);

  const setAmount = (amount: number) => {
    onChange(formatAmount(amount));
    replaceNext.current = true;
  };

  const append = (key: string) => {
    if (key === 'C') {
      onChange('');
      replaceNext.current = false;
      return;
    }
    if (key === '⌫') {
      onChange(value.slice(0, -1));
      replaceNext.current = false;
      return;
    }

    if (key === '.') {
      if (replaceNext.current || !value) {
        onChange('0.');
        replaceNext.current = false;
        return;
      }
      if (value.includes('.')) return;
      onChange(`${value}.`);
      return;
    }

    if (replaceNext.current || value === '' || value === '0') {
      onChange(key);
      replaceNext.current = false;
      return;
    }

    const next = value + key;
    const [, dec] = next.split('.');
    if (dec && dec.length > 2) return;
    onChange(next);
  };

  const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '.', '0', '⌫'];

  return (
    <>
      <div className="quick-cash">
        <button type="button" className="btn" onClick={() => setAmount(due)}>
          Exact
        </button>
        {SA_NOTES.map((note) => (
          <button
            key={note}
            type="button"
            className="btn"
            onClick={() => setAmount(note)}
          >
            {symbol}
            {note}
          </button>
        ))}
      </div>
      <div className="numpad">
        {keys.map((k) => (
          <button key={k} type="button" onClick={() => append(k)}>
            {k}
          </button>
        ))}
        <button type="button" className="numpad-clear" onClick={() => append('C')}>
          Clear
        </button>
      </div>
    </>
  );
}
