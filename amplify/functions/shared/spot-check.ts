export const SPOT_CHECK_PK = 'SPOT';

export const resolveLocationKey = (location: string) => {
  const value = location.trim();
  if (/jcl/i.test(value)) {
    return 'JCL';
  }
  if (/p2/i.test(value)) {
    return 'P2';
  }
  return 'OTHER';
};
