/**
 * Media shown in the broker portal. One place to change a URL.
 * The onboarding explainer ("What happens next", about 3 minutes) is being re-rendered; until its URLs are set the
 * dashboard shows a calm "coming soon" card instead of a broken player.
 */
export const BROKER_ONBOARDING_VIDEO_URL = "https://cmsylaupctrbsvzrgzwy.supabase.co/storage/v1/object/public/marketing-media/broker-onboarding/what-happens-next-720p.mp4";
/** Branded thumbnails (posters) are built by deliverables/broker-success/make-portal-thumbs.py into public/media/broker/. */
export const BROKER_ONBOARDING_POSTER_URL = "/media/broker/what-happens-next-poster.jpg";
export const BROKER_ONBOARDING_VIDEO_DURATION = "3:54";
/** WebVTT captions for the explainer, when available. */
export const BROKER_ONBOARDING_CAPTIONS_URL = "";
export const BROKER_ONBOARDING_VIDEO_TITLE = "What happens next";

/**
 * "Connect your Outlook calendar" (about 2.5 minutes, portrait 720x1280, captions burned in). Source:
 * deliverables/broker-success/calendar-connect-film, served from public/media/broker/. While the URL is empty the
 * calendar card and the Getting-started step show a short note instead.
 */
export const BROKER_CALENDAR_VIDEO_URL = "/media/broker/connect-outlook-calendar-720p.mp4";
export const BROKER_CALENDAR_POSTER_URL = "/media/broker/connect-outlook-poster.jpg";
export const BROKER_CALENDAR_VIDEO_DURATION = "2:24";
export const BROKER_CALENDAR_VIDEO_TITLE = "Connect your Outlook calendar";

/** "Your onboarding guide" (11 scenes, about 4 minutes, 1280x720): sign, pay, introduction, plan, follow-up, lead journey. */
export const BROKER_GUIDE_VIDEO_URL = "/media/broker/onboarding-guide-720p.mp4";
export const BROKER_GUIDE_POSTER_URL = "/media/broker/onboarding-guide-poster.jpg";
export const BROKER_GUIDE_VIDEO_TITLE = "Your onboarding guide";
export const BROKER_GUIDE_VIDEO_DURATION = "3:53";
