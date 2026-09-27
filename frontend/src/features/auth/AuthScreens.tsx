import { type FormEvent, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router'

import { detailOf } from '@/api/errors'
import { Button } from '@/components/Button'
import { Field } from '@/components/Field'
import { Input } from '@/components/Input'
import { Money } from '@/components/Money'
import { useT } from '@/i18n/i18nContext'

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
  /** Two lines, separated by a newline. The catalogue holds `
` rather than
   * a `<br />`: markup in a translation file is how a translator ships an XSS. */
  title: string
  subtitle: string
  children: React.ReactNode
  footer: React.ReactNode
}) {
  const t = useT()

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-sm flex-col justify-end gap-7 px-5 py-10">
      <header className="flex flex-1 flex-col justify-end">
        <p className="text-accent font-display text-2xs font-extrabold tracking-[0.14em] uppercase">
          StudentWise
        </p>
        <h1 className="font-display text-hero mt-3 leading-[1.02] font-black tracking-[-0.04em]">
          {title.split('\n').map((line) => (
            <span key={line} className="block">
              {line}
            </span>
          ))}
        </h1>
        <p className="text-muted mt-3.5 max-w-[30ch] text-base">{subtitle}</p>

        <p className="mt-5 flex items-center gap-2.5">
          <Money amount="412.60" tone="credit" className="text-4xl tracking-[-0.04em]" />
          <span className="text-faint text-xs leading-tight">
            {t('auth.heroCaption')
              .split('\n')
              .map((line) => (
                <span key={line} className="block">
                  {line}
                </span>
              ))}
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
  const t = useT()
  if (!error) return null
  return (
    <p
      role="alert"
      className="bg-danger-soft text-danger rounded-sm px-3 py-2.5 text-sm font-medium"
      dir="auto"
    >
      {detailOf(error, t('auth.login.failed'))}
    </p>
  )
}

export function LoginScreen() {
  const t = useT()
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
      title={t('auth.login.title')}
      subtitle={t('auth.login.subtitle')}
      footer={
        <>
          {t('auth.login.noAccount')}{' '}
          <Link to="/register" className="text-accent font-bold">
            {t('auth.login.signUpLink')}
          </Link>
        </>
      }
    >
      <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
        <FormError error={error} />

        <Field label={t('auth.fields.email')} required>
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

        <Field label={t('auth.fields.password')} required>
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
          {t('auth.login.submit')}
        </Button>
      </form>
    </AuthLayout>
  )
}

export function RegisterScreen() {
  const t = useT()
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
      // A new account is offered Gmail once, then goes home either way.
      navigate('/welcome/gmail', { replace: true })
    } catch (cause) {
      setError(cause)
    } finally {
      setPending(false)
    }
  }

  return (
    <AuthLayout
      title={t('auth.register.title')}
      subtitle={t('auth.register.subtitle')}
      footer={
        <>
          {t('auth.register.haveOne')}{' '}
          <Link to="/login" className="text-accent font-bold">
            {t('auth.register.logInLink')}
          </Link>
        </>
      }
    >
      <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
        <FormError error={error} />

        <Field label={t('auth.fields.name')} required>
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

        <Field label={t('auth.fields.email')} required hint={t('auth.register.emailHint')}>
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
          label={t('auth.fields.password')}
          required
          hint={t('auth.register.passwordHint')}
          error={tooShort ? t('auth.register.tooShort') : undefined}
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
          {t('auth.register.submit')}
        </Button>
      </form>
    </AuthLayout>
  )
}
