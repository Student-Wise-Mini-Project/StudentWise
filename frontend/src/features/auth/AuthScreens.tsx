import { type FormEvent, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router'

import { detailOf } from '@/api/errors'
import { Button } from '@/components/Button'
import { Field } from '@/components/Field'
import { Input } from '@/components/Input'

import { useAuth } from './authContext'

function AuthLayout({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string
  subtitle: string
  children: React.ReactNode
  footer: React.ReactNode
}) {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-sm flex-col justify-center gap-8 px-5 py-12">
      <header className="flex flex-col gap-2">
        <p className="text-accent text-xs font-semibold tracking-[0.16em] uppercase">StudentWise</p>
        <h1 className="font-display text-3xl font-semibold">{title}</h1>
        <p className="text-muted text-base">{subtitle}</p>
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
      className="bg-danger-soft text-danger rounded-lg px-3 py-2.5 text-sm font-medium"
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
      title="Welcome back"
      subtitle="Sign in to see what you owe and what you are owed."
      footer={
        <>
          New here?{' '}
          <Link to="/register" className="text-accent font-semibold">
            Create an account
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
          Sign in
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
      title="Create an account"
      subtitle="Then start a flat, a trip or a couple and add the others by email."
      footer={
        <>
          Already have one?{' '}
          <Link to="/login" className="text-accent font-semibold">
            Sign in
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
