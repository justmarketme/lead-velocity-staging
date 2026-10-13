/**
 * Media shown in the broker portal. One place to change a URL.
 * The onboarding explainer ("What happens next", about 3 minutes) is being re-rendered; until its URLs are set the
 * dashboard shows a calm "coming soon" card instead of a broken player.
 */
export const BROKER_ONBOARDING_VIDEO_URL = "https://cmsylaupctrbsvzrgzwy.supabase.co/storage/v1/object/public/marketing-media/broker-onboarding/what-happens-next-720p.mp4";
export const BROKER_ONBOARDING_POSTER_URL = "https://cmsylaupctrbsvzrgzwy.supabase.co/storage/v1/object/public/marketing-media/broker-onboarding/poster.jpg";
/** WebVTT captions for the explainer, when available. */
export const BROKER_ONBOARDING_CAPTIONS_URL = "";
export const BROKER_ONBOARDING_VIDEO_TITLE = "What happens next";

/**
 * "Connect your Outlook calendar" (about 2.5 minutes, portrait 720x1280, captions burned in). Source:
 * deliverables/broker-success/calendar-connect-film. Empty until the MP4 and poster are uploaded to the public
 * marketing-media bucket; while empty the calendar card and the Getting-started step show a short note instead.
 */
export const BROKER_CALENDAR_VIDEO_URL = "";
export const BROKER_CALENDAR_POSTER_URL = "";
export const BROKER_CALENDAR_VIDEO_TITLE = "Connect your Outlook calendar";
