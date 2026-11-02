# Hunter's Bestiary 1.7.2

This patch improves GM ergonomics around selected-hunter knowledge, Hunt creation, quarry-history colors, and settings portability.

## Selected-hunter context

When a GM controls one player-owned Actor, the normal GM dashboard keeps the complete GM catalogue but derives Bestiary knowledge level, points, progression and Hunt eligibility from that selected player's stored progress. With no player-owned Actor selected, the dashboard retains its normal GM context.

## Hunt selector history states

When New Hunt is opened from that selected-hunter context, every quarry is classified for that hunter as: no knowledge, known/loose, tracked/researched, captured, slain, or escaped. No-knowledge entries are not highlighted. The other states use configurable colors and human-readable labels.

## Color configuration

Hunt Rules now contains a lightweight color section with Classic, High Contrast and Muted built-in presets. The GM can edit each color with a native color input and save the current palette under a reusable custom preset name.

## Settings portability

The Transfer window has a GM-only settings export/import section. It transfers all portable Hunter's Bestiary configuration, including Hunt Rules, quarry colors, player permissions, roll behavior, UI launcher options and current-client UI preferences. Catalogue data, shared Hunts, audit history, installed-content bookkeeping and transient approval queues remain separate data and are intentionally not overwritten by a settings import.
