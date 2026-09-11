import { type FormEvent, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router'

import { detailOf } from '@/api/errors'
import { Button } from '@/components/Button'
import { Field } from '@/components/Field'
import { Input } from '@/components/Input'
import { Money } from '@/components/Money'

import { useAuth } from './authContext'

/**
 * The first screen anyone sees, and the only place the app gets to say what it
 * is for.
 *
 * Bottom-aligned rather than centred. The headline and the sample amount sit in
 * the upper half where they are read at a glance; the fields and the button
 * live in the lower third where a thumb already is, so the page does not have
 * to be scrolled before it can be used.
 *
 * The sample `+₪412.60` is not decoration. It is the thing the app exists to
 * tell you, shown before anyone has an account -- and it is the same `<Money/>`
 * every screen uses, so if the money treatment ever drifts, it drifts here too.
 */
function AuthLayout({
  title,
  subtitle,
  children,
  footer,
}: {
  title: React.ReactNode
  subtitle: string
  children: React.ReactNode
  footer: React.ReactNode
}) {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-sm flex-col justify-end gap-7 px-5 py-10">
      <header className="flex flex-1 flex-col justify-end">
        <p className="text-accent font-display text-2xs font-extrabold tracking-[0.14em] uppercase">
          StudentWise
        </p>
        <h1 className="font-display text-hero mt-3 leading-[1.02] font-black tracking-[-0.04em]">
          {title}
        </h1>
        <p className="text-muted mt-3.5 max-w-[30ch] text-base">{subtitle}</p>

        <p className="mt-5 flex items-center gap-2.5">
          <Money amount="412.60" tone="credit" className="text-4xl tracking-[-0.04em]" />
          <span className="text-faint text-xs leading-tight">
            what the app
            <br />
            tells you first
          </span>
        </p>
      </header>

      {children}

      <p className="text-muted text-center text-sm">{footer}</p>
    </main>
  )
}

/** A failed request, shown where the person is looking. */
function FormError({ error }: { error: unknown }) {
  if (!error) return null
  return (
    <p
      role="alert"
      className="bg-danger-soft text-danger rounded-sm px-3 py-2.5 text-sm font-medium"
      dir="auto"
    >
      {detailOf(error, 'Could not sign you in.')}
    </p>
  )
}

export function LoginScreen() {
  const { signIn } = useAuth()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<unknown>(null)
  const [pending, setPending] = useState(false)

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    setError(null)
    setPending(true)
    try {
      await signIn(email.trim(), password)
      // Back to whatever the expired session interrupted.
      navigate(searchParams.get('next') ?? '/', { replace: true })
    } catch (cause) {
      setError(cause)
    } finally {
      setPending(false)
    }
  }

  return (
    <AuthLayout
      title={
        <>
          Nobody
          <br />
          has to ask.
        </>
      }
      subtitle="Split the rent, the taxi and the Friday shop. Settle in one transfer."
      footer={
        <>
          No account yet?{' '}
          <Link to="/register" className="text-accent font-bold">
            Sign up
          </Link>
        </>
      }
    >
      <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
        <FormError error={error} />

        <Field label="Email" required>
          {(props) => (
            <Input
              {...props}
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              autoComplete="email"
              inputMode="email"
              autoCapitalize="none"
              spellCheck={false}
              required
            />
          )}
        </Field>

        <Field label="Password" required>
          {(props) => (
            <Input
              {...props}
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="current-password"
              required
            />
          )}
        </Field>

        <Button type="submit" size="lg" fullWidth loading={pending} className="mt-2">
          Log in
        </Button>
      </form>
    </AuthLayout>
  )
}

export function RegisterScreen() {
  const { signUp } = useAuth()
  const navigate = useNavigate()

  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<unknown>(null)
  const [pending, setPending] = useState(false)

  // The backend rejects anything shorter, so say so before the round trip
  // rather than after it.
  const tooShort = password.length > 0 && password.length < 8

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    if (tooShort) return
    setError(null)
    setPending(true)
    try {
      await signUp({ name: name.trim(), email: email.trim(), password })
      navigate('/', { replace: true })
    } catch (cause) {
      setError(cause)
    } finally {
      setPending(false)
    }
  }

  return (
    <AuthLayout
      title={
        <>
          Start
          <br />
          keeping count.
        </>
      }
      subtitle="Make a flat, a trip or a couple, and add the others by email."
      footer={
        <>
          Already have one?{' '}
          <Link to="/login" className="text-accent font-bold">
            Log in
          </Link>
        </>
      }
    >
      <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
        <FormError error={error} />

        <Field label="Name" required>
          {(props) => (
            <Input
              {...props}
              value={name}
              onChange={(event) => setName(event.target.value)}
              autoComplete="name"
              required
            />
          )}
        </Field>

        <Field label="Email" required hint="This is how flatmates will find you.">
          {(props) => (
            <Input
              {...props}
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              autoComplete="email"
              inputMode="email"
              autoCapitalize="none"
              spellCheck={false}
              required
            />
          )}
        </Field>

        <Field
          label="Password"
          required
          hint="At least 8 characters."
          error={tooShort ? 'That is still too short.' : undefined}
        >
          {(props) => (
            <Input
              {...props}
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="new-password"
              required
            />
          )}
        </Field>

        <Button
          type="submit"
          size="lg"
          fullWidth
          loading={pending}
          disabled={tooShort}
          className="mt-2"
        >
          Create account
        </Button>
      </form>
    </AuthLayout>
  )
}
