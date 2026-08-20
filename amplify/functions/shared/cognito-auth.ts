import { CognitoJwtVerifier } from 'aws-jwt-verify';
import { buildHttpResponse } from './dynamo-http';

type HttpHeaders = Record<string, string | string[] | undefined>;

type JwtVerifier = {
  verify: (token: string) => Promise<unknown>;
};

let verifier: JwtVerifier | null = null;

const getVerifier = (): JwtVerifier | null => {
  const userPoolId = process.env.USER_POOL_ID;
  if (!userPoolId) {
    return null;
  }
  if (!verifier) {
    const clientId = process.env.USER_POOL_CLIENT_ID;
    verifier = CognitoJwtVerifier.create({
      userPoolId,
      tokenUse: 'id',
      clientId: clientId && clientId.length > 0 ? clientId : null,
    });
  }
  return verifier;
};

export const getBearerToken = (headers: HttpHeaders) => {
  const entries = Object.entries(headers ?? {});
  const authEntry = entries.find(([key]) => key.toLowerCase() === 'authorization');
  const authValue = authEntry?.[1];
  const auth = Array.isArray(authValue) ? authValue[0] : authValue;
  if (typeof auth !== 'string' || !auth.toLowerCase().startsWith('bearer ')) {
    return null;
  }
  return auth.slice('Bearer '.length).trim();
};

export const rejectIfUnauthenticated = async (event: {
  headers?: HttpHeaders;
  requestContext?: { http?: { method?: string } };
}) => {
  if (process.env.REQUIRE_AUTH === 'false') {
    return null;
  }
  if (!event.requestContext?.http?.method) {
    return null;
  }
  if (event.requestContext.http.method === 'OPTIONS') {
    return null;
  }

  const jwtVerifier = getVerifier();
  if (!jwtVerifier) {
    return null;
  }

  const token = getBearerToken(event.headers ?? {});
  if (!token) {
    return buildHttpResponse(401, { message: 'Unauthorized' });
  }

  try {
    await jwtVerifier.verify(token);
    return null;
  } catch {
    return buildHttpResponse(401, { message: 'Invalid token' });
  }
};

type JwtPayload = {
  email?: string;
  'cognito:username'?: string;
  username?: string;
};

export const getActorEmail = async (event: {
  headers?: HttpHeaders;
}): Promise<string> => {
  const jwtVerifier = getVerifier();
  const token = getBearerToken(event.headers ?? {});
  if (!jwtVerifier || !token) {
    return 'system';
  }

  try {
    const payload = (await jwtVerifier.verify(token)) as JwtPayload;
    const email = payload.email?.trim();
    if (email) {
      return email;
    }
    return (
      payload['cognito:username']?.trim() ||
      payload.username?.trim() ||
      'system'
    );
  } catch {
    return 'system';
  }
};
