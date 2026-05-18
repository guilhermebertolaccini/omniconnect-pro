// External app URLs — replace with published URLs in production
export const EXTERNAL_APPS = {
  omnihub: {
    baseUrl: "https://omniconnect-hub.lovable.app",
    conversations: "/conversations",
    label: "OmniHub",
  },
  adsManager: {
    baseUrl: "https://smart-ad-automator.lovable.app",
    campaigns: "/campaigns",
    label: "Ads Manager",
  },
} as const;

export function getOmniHubUrl(path = "") {
  return `${EXTERNAL_APPS.omnihub.baseUrl}${path}`;
}

export function getAdsManagerUrl(path = "") {
  return `${EXTERNAL_APPS.adsManager.baseUrl}${path}`;
}
