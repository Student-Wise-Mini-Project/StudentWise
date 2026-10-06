/**
 * Building invite links and the ways to send them.
 *
 * The link is built here, from wherever the app is running, rather than by the
 * server: the same token then works on the live site and on a laptop.
 *
 * No email is sent by the app -- it has no mail server. "Email" opens the
 * person's own mail app with the message written, which is also what makes it
 * come from someone they know.
 */

export function inviteUrl(token: string, origin: string = window.location.origin): string {
  return `${origin}/join/${encodeURIComponent(token)}`
}

/** WhatsApp's own share link: opens the app (or web) with the text ready. */
export function whatsappUrl(text: string): string {
  return `https://wa.me/?text=${encodeURIComponent(text)}`
}

export function mailtoUrl({
  to = '',
  subject,
  body,
}: {
  to?: string
  subject: string
  body: string
}) {
  const query = `subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
  return `mailto:${encodeURIComponent(to).replace(/%40/g, '@')}?${query}`
}

/**
 * A path to return to after signing in, or null. Only paths inside the app:
 * `?next=https://elsewhere` must not turn a sign-in page into a way out.
 */
export function safeNext(next: string | null | undefined): string | null {
  if (!next || !next.startsWith('/') || next.startsWith('//') || next.startsWith('/\\')) return null
  return next
}
