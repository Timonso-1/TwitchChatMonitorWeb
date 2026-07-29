/**
 * Aufbereitung der Channel-Optionen für die Filter-Dropdowns.
 *
 * Die Optionen stammen aus den aufgezeichneten Daten, nicht aus der Tabelle
 * `channels`. Ein gelöschter Channel bleibt dadurch filterbar, solange seine
 * Zeilen in der Datenbank liegen.
 *
 * Gruppiert wird über die Twitch-Broadcaster-ID. Sie ist als einzige Kennung
 * stabil: `channel_uuid` wird bei einer Neuanlage neu vergeben, und
 * `channel_name` ist nur ein Snapshot vom Aufzeichnungszeitpunkt, der sich bei
 * einer Umbenennung bei Twitch ändert.
 *
 * Reine Funktionen ohne Datenbankzugriff – der Zugriff liegt in
 * `queries/channels.ts` bzw. `queries/viewer-profile.ts`.
 */

/** Eine in den Daten gefundene Channel-Spur. */
export interface ChannelFilterRow {
  uuid: string;
  twitchId: string;
  /** Name aus der jüngsten Datenzeile dieser UUID. */
  name: string;
}

export interface ChannelFilterOption {
  /** Twitch-Broadcaster-ID, Wert im URL-Parameter. */
  twitchId: string;
  /** Aktueller Name, bevorzugt aus `channels`. */
  name: string;
  /** Fertige Beschriftung fürs Dropdown. */
  label: string;
  /** Alle UUIDs, unter denen dieser Channel aufgezeichnet wurde. */
  uuids: string[];
  /** Kein Eintrag mehr in `channels`. */
  orphaned: boolean;
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Unterscheidet alte Links (UUID) von neuen (Twitch-ID, reine Ziffern). */
export function looksLikeUuid(value: string): boolean {
  return UUID_PATTERN.test(value);
}

/**
 * Fasst die gefundenen Spuren zu einer Option je Twitch-ID zusammen.
 *
 * `registeredNames` bildet `channels.uuid` auf den dort gepflegten Namen ab.
 * Existiert der Eintrag noch, gewinnt dessen Name; sonst zählt der Name aus den
 * Daten und die Option wird als verwaist gekennzeichnet.
 */
export function buildChannelFilterOptions(
  rows: ChannelFilterRow[],
  registeredNames: Map<string, string>,
): ChannelFilterOption[] {
  const grouped = new Map<string, { names: string[]; uuids: string[]; registeredName?: string }>();

  for (const row of rows) {
    let entry = grouped.get(row.twitchId);
    if (!entry) {
      entry = { names: [], uuids: [] };
      grouped.set(row.twitchId, entry);
    }

    if (!entry.uuids.includes(row.uuid)) entry.uuids.push(row.uuid);
    if (row.name && !entry.names.includes(row.name)) entry.names.push(row.name);

    const registered = registeredNames.get(row.uuid);
    if (registered) entry.registeredName = registered;
  }

  const options: ChannelFilterOption[] = [];

  for (const [twitchId, entry] of grouped) {
    const orphaned = entry.registeredName === undefined;
    // Ohne Eintrag in `channels` bleibt nur der Name aus den Daten. Bei mehreren
    // (Umbenennung) steht der jüngste vorn, weil die Zeilen so geliefert werden.
    const name = entry.registeredName ?? entry.names[0] ?? twitchId;

    options.push({
      twitchId,
      name,
      label: orphaned ? `${name} (gelöscht)` : name,
      uuids: entry.uuids,
      orphaned,
    });
  }

  // Vorhandene Channels zuerst, verwaiste ans Ende – innerhalb alphabetisch.
  return options.sort((a, b) => {
    if (a.orphaned !== b.orphaned) return a.orphaned ? 1 : -1;
    return a.name.localeCompare(b.name, "de");
  });
}

export interface ResolvedChannelFilter {
  /** Normalisierter Wert für Formulare und Links, sonst undefined. */
  value: string | undefined;
  /** UUIDs für die WHERE-Bedingung, sonst undefined (kein Filter). */
  uuids: string[] | undefined;
}

/**
 * Löst den URL-Parameter zu den UUIDs auf, über die tatsächlich gefiltert wird.
 *
 * Gefiltert wird bewusst weiter über `channel_uuid`: auf `channel_id` gibt es in
 * keiner der Datentabellen einen Index, ein Filter darauf wäre ein Full Scan.
 *
 * Alte Links tragen noch eine UUID im Parameter. Gehört sie zu einer bekannten
 * Option, wird auf deren Twitch-ID normalisiert; sonst filtert sie unverändert
 * als einzelne UUID weiter.
 */
export function resolveChannelFilter(
  options: ChannelFilterOption[],
  value: string | undefined,
): ResolvedChannelFilter {
  if (!value) return { value: undefined, uuids: undefined };

  const byTwitchId = options.find((option) => option.twitchId === value);
  if (byTwitchId) return { value: byTwitchId.twitchId, uuids: byTwitchId.uuids };

  if (looksLikeUuid(value)) {
    const byUuid = options.find((option) => option.uuids.includes(value));
    if (byUuid) return { value: byUuid.twitchId, uuids: byUuid.uuids };
    return { value, uuids: [value] };
  }

  // Unbekannter Wert: wie ein nicht gesetzter Filter behandeln, statt eine
  // garantiert leere Ergebnisliste zu zeigen.
  return { value: undefined, uuids: undefined };
}
