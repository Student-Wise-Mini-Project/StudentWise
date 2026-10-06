import { useMutation } from '@tanstack/react-query'
import { type FormEvent, useState } from 'react'

import { detailOf } from '@/api/errors'
import { Button } from '@/components/Button'
import { Field } from '@/components/Field'
import { Input } from '@/components/Input'
import { useT } from '@/i18n/i18nContext'
import { formatPhone, phoneProblem } from '@/lib/phone'

import { updatePhoneNumber } from './api'
import { useAuth } from './authContext'

/**
 * Your phone number, which is how a flatmate pays you back with Bit or PayBox
 * (7.3). Only people who share a group with you can see it.
 *
 * Checked here for the message, in your language, and again by the server,
 * which is what stores it -- normalised, whatever was typed.
 */
export function PhoneSection() {
  const t = useT()
  const { user, setUser } = useAuth()
  const stored = user?.phone_number ? formatPhone(user.phone_number) : ''

  // null until edited, so the field follows the account until you type.
  const [draft, setDraft] = useState<string | null>(null)
  const [attempted, setAttempted] = useState(false)
  const [done, setDone] = useState<'saved' | 'removed' | null>(null)

  const save = useMutation({
    mutationFn: updatePhoneNumber,
    onSuccess: (updated) => {
      setUser(updated)
      setDraft(null)
      setAttempted(false)
      setDone(updated.phone_number ? 'saved' : 'removed')
    },
  })

  const value = draft ?? stored
  const problem = phoneProblem(value)
  const changed = draft !== null && draft.trim() !== stored

  function submit(event: FormEvent) {
    event.preventDefault()
    setAttempted(true)
    if (problem) return
    save.mutate(value.trim())
  }

  const error = attempted && problem ? t(`settings.phone.problems.${problem}`) : undefined

  return (
    <form className="px-4" onSubmit={submit} noValidate>
      {/* The field's label doubles as the section heading: it is styled like
       * the others ("Appearance", "Language"), and a heading above a label
       * saying the same thing again read as a stutter. */}
      <Field label={t('settings.phone.title')} hint={t('settings.phone.hint')} error={error}>
        {(props) => (
          <Input
            {...props}
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            // Digits and dashes read left to right in Hebrew too.
            dir="ltr"
            className="text-start"
            placeholder={t('settings.phone.placeholder')}
            value={value}
            onChange={(event) => {
              setDraft(event.target.value)
              setDone(null)
              save.reset()
            }}
          />
        )}
      </Field>

      {save.isError && (
        <p role="alert" className="text-danger mt-2 text-xs font-medium">
          {detailOf(save.error)}
        </p>
      )}

      <div className="mt-3 flex gap-2">
        <Button type="submit" size="sm" disabled={!changed} loading={save.isPending}>
          {t('settings.phone.save')}
        </Button>
        {stored && (
          <Button
            size="sm"
            variant="ghost"
            disabled={save.isPending}
            onClick={() => {
              setAttempted(false)
              save.mutate(null)
            }}
          >
            {t('settings.phone.remove')}
          </Button>
        )}
        {done && (
          <p role="status" className="text-credit self-center text-xs font-semibold">
            {t(`settings.phone.${done}`)}
          </p>
        )}
      </div>
    </form>
  )
}
