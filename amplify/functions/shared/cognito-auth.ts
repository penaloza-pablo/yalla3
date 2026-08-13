import { CognitoJwtVerifier } from 'aws-jwt-verify';
import { buildHttpResponse } from './dynamo-http';

type HttpHeaders = Record<string, string | undefined>;

let verifier: ReturnType<typeof CognitoJwtVerifier.create> | null = null;

const getVerifier = () => {
  const userPoolId = process.env.USER_POOL_ID;
  if (!userPoolId) {
    return null;
  }
  if (!verifier) {
    verifier = CognitoJwtVerifier.create({
      userPoolId,
      tokenUse: 'id',
    });
  }
  return verifier;
};

export const getBearerToken = (headers: HttpHeaders) => {
  const auth = headers.authorization ?? headers.Authorization;
  if (!auth?.startsWith('Bearer ')) {
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
