const AFFILIATE_REFERRAL_STORAGE_KEY = "affiliate_referral_code";
const LEGACY_REFERRAL_STORAGE_KEY = "referral_code";

function normalizeReferralCode(value: string | null | undefined) {
  return String(value || "").trim().slice(0, 160);
}

function getBrowserStorage() {
  if (typeof window === "undefined") {
    return null;
  }

  return {
    localStorage: window.localStorage,
    sessionStorage: window.sessionStorage,
  };
}

export function storeAffiliateReferralCode(value: string | null | undefined) {
  const referralCode = normalizeReferralCode(value);
  const storage = getBrowserStorage();

  if (!referralCode || !storage) {
    return "";
  }

  storage.sessionStorage.setItem(AFFILIATE_REFERRAL_STORAGE_KEY, referralCode);
  storage.sessionStorage.removeItem(LEGACY_REFERRAL_STORAGE_KEY);
  storage.localStorage.removeItem(LEGACY_REFERRAL_STORAGE_KEY);
  storage.localStorage.removeItem(AFFILIATE_REFERRAL_STORAGE_KEY);

  return referralCode;
}

export function readAffiliateReferralCode() {
  const storage = getBrowserStorage();

  if (!storage) {
    return "";
  }

  return (
    normalizeReferralCode(storage.sessionStorage.getItem(AFFILIATE_REFERRAL_STORAGE_KEY)) ||
    normalizeReferralCode(storage.sessionStorage.getItem(LEGACY_REFERRAL_STORAGE_KEY))
  );
}

export function clearAffiliateReferralCode() {
  const storage = getBrowserStorage();

  if (!storage) {
    return;
  }

  storage.sessionStorage.removeItem(AFFILIATE_REFERRAL_STORAGE_KEY);
  storage.localStorage.removeItem(AFFILIATE_REFERRAL_STORAGE_KEY);
  storage.sessionStorage.removeItem(LEGACY_REFERRAL_STORAGE_KEY);
  storage.localStorage.removeItem(LEGACY_REFERRAL_STORAGE_KEY);
}

export function captureAffiliateReferralFromSearch(search?: string) {
  if (typeof window === "undefined") {
    return "";
  }

  const params = new URLSearchParams(search ?? window.location.search);
  const referralCode = params.get("ref");

  window.localStorage.removeItem(AFFILIATE_REFERRAL_STORAGE_KEY);
  window.localStorage.removeItem(LEGACY_REFERRAL_STORAGE_KEY);

  return referralCode ? storeAffiliateReferralCode(referralCode) : "";
}
