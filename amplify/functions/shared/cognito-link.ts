const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const normalizeCognitoEmail = (value: unknown): string => {
  if (typeof value !== 'string') {
    return '';
  }
  return value.trim().toLowerCase();
};

export const isValidCognitoEmail = (email: string): boolean =>
  Boolean(email) && EMAIL_PATTERN.test(email);

export const cognitoEmailOf = (item: Record<string, unknown>): string =>
  normalizeCognitoEmail(item.cognitoEmail);

export const findDuplicateCognitoEmail = (
  items: Record<string, unknown>[],
  email: string,
  excludeId?: string,
) => {
  if (!email) {
    return undefined;
  }
  return items.find((entry) => {
    const id = String(entry.id ?? '');
    if (excludeId && id === excludeId) {
      return false;
    }
    return cognitoEmailOf(entry) === email;
  });
};

export const applyCognitoLinkFields = (
  item: Record<string, unknown>,
  payload: { cognitoEmail?: string; cognitoName?: string },
): string | undefined => {
  if (payload.cognitoEmail === undefined) {
    return undefined;
  }
  const email = normalizeCognitoEmail(payload.cognitoEmail);
  if (!email) {
    delete item.cognitoEmail;
    delete item.cognitoName;
    return undefined;
  }
  if (!isValidCognitoEmail(email)) {
    return 'cognitoEmail is invalid.';
  }
  item.cognitoEmail = email;
  const name =
    typeof payload.cognitoName === 'string' ? payload.cognitoName.trim() : '';
  if (name) {
    item.cognitoName = name;
  } else {
    delete item.cognitoName;
  }
  return undefined;
};
