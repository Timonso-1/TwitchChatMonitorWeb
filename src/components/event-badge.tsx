/**
 * Veraltet – die Badges liegen jetzt in `twitch-badges.tsx`,
 * die Label- und Formatierungslogik in `@/lib/twitch`.
 * Diese Datei bleibt als Weiterleitung bestehen, damit aeltere Importe nicht brechen.
 */
export { EventBadge, ModerationBadge, SubTierBadge, ChatRoleBadges } from "./twitch-badges";
export { formatDuration } from "@/lib/twitch";
