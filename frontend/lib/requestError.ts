export function isTransientRequestError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;

  const candidate = error as { name?: unknown; message?: unknown };
  const name = String(candidate.name || '').toLowerCase();
  const message = String(candidate.message || '').toLowerCase();

  return (
    name === 'aborterror' ||
    name === 'timeouterror' ||
    (name === 'typeerror' && (
      message.includes('failed to fetch') ||
      message.includes('networkerror') ||
      message.includes('load failed')
    ))
  );
}
