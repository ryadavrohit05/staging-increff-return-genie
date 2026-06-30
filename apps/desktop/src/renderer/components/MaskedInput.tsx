/**
 * Password input with a show/hide toggle. Used for marketplace + login passwords.
 */
import { useState, type InputHTMLAttributes } from 'react';
import { Eye, EyeOff } from './icons';

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, 'type'>;

export function MaskedInput(props: Props) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <input
        {...props}
        type={show ? 'text' : 'password'}
        className={`rg-input pr-10 ${props.className ?? ''}`}
      />
      <button
        type="button"
        onClick={() => setShow((s) => !s)}
        aria-label={show ? 'Hide password' : 'Show password'}
        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-ink-muted hover:text-ink-secondary"
      >
        {show ? <EyeOff /> : <Eye />}
      </button>
    </div>
  );
}
