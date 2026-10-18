/**
 * The short "Connect your Outlook calendar" film (portrait, captions burned in) shown next to the connect button and in
 * the Getting-started calendar step. Until BROKER_CALENDAR_VIDEO_URL is set it shows a one-line note, never a broken player.
 */
import { PlayCircle } from "lucide-react";
import { BROKER_CALENDAR_POSTER_URL, BROKER_CALENDAR_VIDEO_DURATION, BROKER_CALENDAR_VIDEO_TITLE, BROKER_CALENDAR_VIDEO_URL } from "@/lib/brokerMedia";
import BrokerVideo from "../BrokerVideo";

export default function CalendarHowToVideo({ mutedClass = "text-muted-foreground" }: { mutedClass?: string }) {
  if (!BROKER_CALENDAR_VIDEO_URL) {
    return (
      <p className={`flex items-center gap-2 text-xs ${mutedClass}`}>
        <PlayCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
        A 2-minute video of each step is coming soon.
      </p>
    );
  }
  return (
    <figure className="space-y-1.5">
      <BrokerVideo src={BROKER_CALENDAR_VIDEO_URL} poster={BROKER_CALENDAR_POSTER_URL} title={BROKER_CALENDAR_VIDEO_TITLE}
        duration={BROKER_CALENDAR_VIDEO_DURATION} portrait className="max-w-[260px]" />
      <figcaption className={`text-xs ${mutedClass}`}>Watch: {BROKER_CALENDAR_VIDEO_TITLE} ({BROKER_CALENDAR_VIDEO_DURATION}, captions on screen)</figcaption>
    </figure>
  );
}
